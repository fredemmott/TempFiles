export interface InitData {
  id: string,
  username: string,
  server_prf_seed: string,
  credential: PublicKeyCredential,
}

export function initialize(data: InitData): void {
  sessionStorage.clear();

  sessionStorage.setItem("id", data.id);
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
  return sessionStorage.getItem("id") !== null;
}

export function id(): string | null {
  return sessionStorage.getItem("id");
}

export function supports_e2ee(): boolean {
  return sessionStorage.getItem("prf") !== null;
}