export type ExternalReactionReference = { support: string; reactionKn: number; reference: string };

/** Reference-only pad pressure; this does not validate the crane reaction method. */
export function externalReferencePadPressure(reaction: ExternalReactionReference, padWidthM: number, padLengthM: number) {
  if (!reaction.reference.trim()) throw new Error("An external reaction reference is required.");
  if (!Number.isFinite(padWidthM) || !Number.isFinite(padLengthM) || padWidthM <= 0 || padLengthM <= 0) throw new Error("Pad dimensions must be greater than zero.");
  if (!Number.isFinite(reaction.reactionKn)) throw new Error("Reference reaction must be finite.");
  const warnings = reaction.reactionKn <= 0 ? [reaction.reactionKn < 0 ? "External reference contains a negative support reaction; review the source calculation." : "External reference contains a zero support reaction; confirm the support state."] : [];
  return { origin: "external_reference" as const, support: reaction.support, reactionKn: reaction.reactionKn, pressureKpa: reaction.reactionKn / (padWidthM * padLengthM), independentlyVerified: false, warnings };
}
