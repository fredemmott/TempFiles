import decode_urlsafe_base64 from "./decode_urlsafe_base64";

export interface InitData {
  session: string,
  username: string,
  server_prf_seed: string,
  credential: PublicKeyCredential,
}

export function initialize(data: InitData): void {
  sessionStorage.clear();

  sessionStorage.setItem("session_token", data.session);
  sessionStorage.setItem("username", data.username);
  sessionStorage.setItem("server_prf_seed", data.server_prf_seed);

  let prf = data.credential.getClientExtensionResults().prf;
  if (prf && prf.results && prf.results.first) {
    let source = prf.results.first;
    if (source instanceof ArrayBuffer) {
      source = new Uint8Array(source);
    } else {
      source = new Uint8Array(source.buffer);
    }
    // @ts-ignore toBase64() - TC39, but widely supported
    sessionStorage.setItem("prf", source.toBase64());
  }
}

export function is_logged_in(): boolean {
  return sessionStorage.getItem("username") !== null;
}

export function supports_e2ee(): boolean {
  return sessionStorage.getItem("prf") !== null;
}

async function hkdf_key(seed: string | null): Promise<CryptoKey | null> {
  if (seed === null) {
    return null;
  }
  return await crypto.subtle.importKey(
    "raw",
    decode_urlsafe_base64(seed),
    "HKDF",
    false,
    ["deriveKey"]
  );
}

export async function e2ee_hkdf_key(): Promise<CryptoKey | null> {
  return await hkdf_key(sessionStorage.getItem("prf"));
}

export async function server_trust_hkdf_key(): Promise<CryptoKey> {
  const key = await hkdf_key(sessionStorage.getItem("server_prf_seed"));
  if (key === null) {
    throw new Error("Server PRF seed is not set");
  }
  return key;
}

export function token(): string {
  const token = sessionStorage.getItem("session_token");
  if (token === null) {
    throw new Error("Session token is not set");
  }
  return token;
}