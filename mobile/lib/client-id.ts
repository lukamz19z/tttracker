import { createPortableId, createPortableUuid } from "../../lib/portable-id";

/** Pure JavaScript ID for operational local/mutation identities. */
export function createClientId(prefix?: string) {
  return createPortableId(Math.random, prefix);
}

/** UUID-shaped operational key where a canonical database UUID is required. */
export function createClientUuid() {
  return createPortableUuid();
}
