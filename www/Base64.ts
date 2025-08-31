/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

declare global {
  interface Uint8ArrayConstructor {
    fromBase64?: (_: string) => Uint8Array<ArrayBuffer>;
  }

  interface Uint8Array<TArrayBuffer> {
    toBase64?: () => string;
  }
}

export function encode(data: Uint8Array<ArrayBufferLike>): string {
  if (data.toBase64) {
    return data.toBase64();
  }
  return btoa(String.fromCharCode(...data));
}

export function decode(encoded: string): Uint8Array<ArrayBuffer> {
  // Transparently allow url-safe base64
  encoded = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (encoded.length % 4)) % 4;
  encoded += "=".repeat(padding);
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}
