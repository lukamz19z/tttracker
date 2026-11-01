export type MaterialRecipientChannels = { inApp: boolean; push: boolean; email: boolean };

/** Explicit issue recipients bypass automatic subscription filters and dedupe by user ID. */
export function mergeExplicitMaterialRecipientChannels(
  channels: Map<string, MaterialRecipientChannels>,
  explicitUserIds: Array<string | null | undefined>,
) {
  for (const rawId of explicitUserIds) {
    const userId = String(rawId ?? "").trim();
    if (!userId) continue;
    channels.set(userId, { inApp: true, push: true, email: true });
  }
  return channels;
}
