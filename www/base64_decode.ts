declare global {
  interface Uint8ArrayConstructor {
    fromBase64?: (_: string) => Uint8Array<ArrayBuffer>;
  }
}

export default function base64_decode(encoded: string): Uint8Array<ArrayBuffer> {
  // Transparently allow url-safe base64
  encoded = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (encoded.length % 4)) % 4;
  encoded += "=".repeat(padding);
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  return Uint8Array.from(btoa(encoded), (c) => c.charCodeAt(0));
}
