/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

import * as Base64 from "./Base64";

export interface InitData {
  session: string,
  username: string,
  server_prf_seed: string,
  credential: PublicKeyCredential,
}

export function initialize(data: InitData): void {
  sessionStorage.clear();

  sessionStorage.setItem("login_time", Date.now().toString());
  sessionStorage.setItem("session_token", data.session);
  sessionStorage.setItem("username", data.username);
  sessionStorage.setItem("server_prf_seed", data.server_prf_seed);

  let prf = data.credential.getClientExtensionResults().prf;
  if (prf && prf.results && prf.results.first) {
    let source = prf.results.first;
    if (source instanceof ArrayBuffer) {
      sessionStorage.setItem("prf", Base64.encode(new Uint8Array(source)));
    } else {
      sessionStorage.setItem("prf", Base64.encode(new Uint8Array(source.buffer)));
    }
  }
}

export function isLoggedIn(): boolean {
  return sessionStorage.getItem("username") !== null;
}

export function getLoginTime(): Date {
  return new Date(Number.parseInt(sessionStorage.getItem("login_time")!));
}

export function isE2EESupported(): boolean {
  return sessionStorage.getItem("prf") !== null;
}

async function deriveKey(seed: string | null): Promise<CryptoKey | null> {
  if (seed === null) {
    return null;
  }
  return await crypto.subtle.importKey(
    "raw",
    Base64.decode(seed),
    "HKDF",
    false,
    ["deriveKey"]
  );
}

export async function deriveE2EEKey(): Promise<CryptoKey | null> {
  return await deriveKey(sessionStorage.getItem("prf"));
}

export async function deriveServerTrustKey(): Promise<CryptoKey> {
  const key = await deriveKey(sessionStorage.getItem("server_prf_seed"));
  if (key === null) {
    throw new Error("Server PRF seed is not set");
  }
  return key;
}

export function getToken(): string {
  const token = sessionStorage.getItem("session_token");
  if (token === null) {
    throw new Error("Session token is not set");
  }
  return token;
}

export function clear(): void {
  sessionStorage.clear();
}