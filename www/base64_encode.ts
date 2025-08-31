/*
 * Copyright 2025 Fred Emmott <fred@fredemmott.com>
 * SPDX-License-Identifier: MIT
 *
 */

declare global {
  interface Uint8Array<TArrayBuffer> {
    toBase64?: () => string;
  }
}
export default function base64_encode(data: Uint8Array<ArrayBufferLike>): string {
  if (data.toBase64) {
    return data.toBase64();
  }
  return btoa(String.fromCharCode(...data));
}