/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import * as Base64 from "./Base64";
import * as Session from "./Session";
import * as UploadFile from "./api/files/upload";

const DEBUG_CRYPTO_SECRETS = false;
const EXTRACTABLE_CRYPTO_KEYS = DEBUG_CRYPTO_SECRETS;

export interface HKDFKeys {
  e2ee_key: CryptoKey | null,
  server_trust_key: CryptoKey,
}

async function encryptBinaryData(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("encrypting", {
      key: Base64.encode(new Uint8Array(exported_key)),
      iv: Base64.encode(iv),
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

async function encryptFileContents(params: CryptoParams, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return await encryptBinaryData(params.key, params.data_iv, data);
}

async function encryptFileName(params: CryptoParams, filename: string): Promise<Uint8Array<ArrayBuffer>> {
  return await encryptBinaryData(params.key, params.filename_iv, new TextEncoder().encode(filename));
}

export async function decrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (DEBUG_CRYPTO_SECRETS) {
    const exported_key = await crypto.subtle.exportKey('raw', key);
    console.log("decrypting", {
      key: Base64.encode(new Uint8Array(exported_key)),
      iv: Base64.encode(iv),
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
      salt: Base64.encode(salt),
      key: Base64.encode(new Uint8Array(await crypto.subtle.exportKey('raw', key))),
    });
  }
  return key;
}

interface CryptoParams {
  salt: Uint8Array<ArrayBuffer>,
  key: CryptoKey,
  filename_iv: Uint8Array<ArrayBuffer>,
  data_iv: Uint8Array<ArrayBuffer>,
}

async function generateParametersForNewFile(hkdf_key: CryptoKey): Promise<CryptoParams> {
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
      filename_iv: Base64.encode(params.filename_iv),
      data_iv: Base64.encode(params.data_iv),
    });
  }
  return params;
}

export type EncryptedFile = Omit<UploadFile.Request, "expires_at" | "max_downloads" | "uuid">;

export async function encrypt(
  file: File, hkdfKeys: HKDFKeys): Promise<EncryptedFile> {
  let isE2EE = true;
  let hkdfKey = hkdfKeys.e2ee_key;
  if (hkdfKey === null) {
    isE2EE = false;
    hkdfKey = hkdfKeys.server_trust_key;
  }

  const crypto_params = await generateParametersForNewFile(hkdfKey);
  const encrypted_filename = await encryptFileName(crypto_params, file.name);
  const unencrypted_data = new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  }));

  const encrypted_data = await encryptFileContents(
    crypto_params,
    unencrypted_data,
  );

  return {
    is_e2ee: isE2EE,
    salt: crypto_params.salt,
    filename_iv: crypto_params.filename_iv,
    data_iv: crypto_params.data_iv,
    encrypted_filename,
    encrypted_data,
  };
}

