import * as Crypto from "expo-crypto";
import { createPortableId } from "../../lib/portable-id";

/** UUID source backed by Expo's native crypto module on iOS and Android. */
export function createClientId() {
  return createPortableId(Crypto.randomUUID);
}
