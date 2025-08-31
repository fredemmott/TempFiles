/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import base64_encode from "./base64_encode";
import * as Session from "./Session";

const DEBUG_CRYPTO_SECRETS = false;
const EXTRACTABLE_CRYPTO_KEYS = DEBUG_CRYPTO_SECRETS;

export interface HKDFKeys {
  e2ee_key: CryptoKey | null,
  server_trust_key: CryptoKey,
}

async function encrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("encrypting", {
      key: base64_encode(new Uint8Array(exported_key)),
      iv: base64_encode(iv),
    });
  }

  return new Uint8Array(await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  ));
}

export async function encryptFileContents(params: CryptoParams, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return await encrypt(params.key, params.data_iv, data);
}

export async function encryptFileName(params: CryptoParams, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return await encrypt(params.key, params.filename_iv, data);
}

export async function decrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("decrypting", {
      key: base64_encode(new Uint8Array(exported_key)),
      iv: base64_encode(iv),
      data
    });
  }
  return new Uint8Array(await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  ));
}

export async function getHKDFKeys(): Promise<HKDFKeys> {
  let [e2ee_key, server_trust_key] = [
    await Session.e2ee_hkdf_key(),
    await Session.server_trust_hkdf_key(),
  ];
  return {
    e2ee_key,
    server_trust_key,
  };
}

export async function deriveKey(hkdf_key: CryptoKey, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const params: HkdfParams = {
    name: "HKDF",
    hash: "SHA-256",
    salt: salt,
    info: encoder.encode("user-file"),
  };
  const key = await crypto.subtle.deriveKey(
    params,
    hkdf_key,
    {name: "AES-GCM", length: 128},
    EXTRACTABLE_CRYPTO_KEYS,
    ["encrypt", "decrypt"],
  );
  if (DEBUG_CRYPTO_SECRETS) {
    console.log("Generated per-file key", {
      salt: base64_encode(salt),
      key: base64_encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
    });
  }
  return key;
}

export interface CryptoParams {
  salt: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
  filename_iv: Uint8Array<ArrayBuffer>,
  data_iv: Uint8Array<ArrayBuffer>,
}

export async function generateParametersForNewFile(hkdf_key: CryptoKey): Promise<CryptoParams> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(hkdf_key, salt);
  const params: CryptoParams = {
    salt,
    key,
    filename_iv: crypto.getRandomValues(new Uint8Array(12)),
    data_iv: crypto.getRandomValues(new Uint8Array(12)),
  };
  if (DEBUG_CRYPTO_SECRETS) {
    console.log({
      filename_iv: base64_encode(params.filename_iv),
      data_iv: base64_encode(params.data_iv),
    });
  }
  return params;
}
