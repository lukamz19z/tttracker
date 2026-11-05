let localCounter = 0;
let uuidTimestamp = -1;
let uuidCounter = 0;

/**
 * Creates a local operational ID. These IDs are mutation/draft identities,
 * never credentials or security tokens, so a platform crypto API is not needed.
 */
export function createPortableId(random: () => number = Math.random, prefix = "op") {
  localCounter = (localCounter + 1) % Number.MAX_SAFE_INTEGER;
  const time = Date.now().toString(36);
  const sequence = localCounter.toString(36);
  const randomPart = [0, 1]
    .map(() => Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * Number.MAX_SAFE_INTEGER)
      .toString(36)
      .padStart(11, "0"))
    .join("");
  const safePrefix = prefix.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "op";
  return `${safePrefix}_${time}_${sequence}_${randomPart}`;
}

/** UUID-shaped, pure-JavaScript operational key for existing UUID columns. */
export function createPortableUuid(random: () => number = Math.random) {
  const now = Date.now();
  if (now === uuidTimestamp) uuidCounter = (uuidCounter + 1) & 0xfff;
  else {
    uuidTimestamp = now;
    uuidCounter = 0;
  }

  const timestamp = Math.max(0, now).toString(16).padStart(12, "0").slice(-12);
  const counter = uuidCounter.toString(16).padStart(3, "0");
  const variant = (8 + Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * 4)).toString(16);
  const randomTail = Array.from({ length: 15 }, () =>
    Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * 16).toString(16),
  ).join("");
  const hex = `${timestamp}4${counter}${variant}${randomTail}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
