export default function (encoded: String): Uint8Array {
  encoded = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (encoded.length % 4)) % 4;
  encoded += "=".repeat(padding);
  // @ts-ignore TC39, but widely supported
  return Uint8Array.fromBase64(encoded);
}
