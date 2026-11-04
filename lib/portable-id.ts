type CryptoSource = Pick<Crypto, "randomUUID" | "getRandomValues">;

/** Creates a UUID from a runtime provider, or from Web Crypto in browser/Node. */
export function createPortableId(nativeRandomUUID?: () => string) {
  if (nativeRandomUUID) return nativeRandomUUID();

  const source: CryptoSource | undefined = globalThis.crypto;
  if (source?.randomUUID) return source.randomUUID();
  if (!source?.getRandomValues) {
    throw new Error("A secure UUID source is not available in this runtime.");
  }

  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
