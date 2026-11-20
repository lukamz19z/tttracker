export const KG_PER_TONNE = 1000;
export const KPA_PER_KN_PER_SQUARE_METRE = 1;

export function kgToTonnes(kg: number) {
  return kg / KG_PER_TONNE;
}

export function tonnesToKg(tonnes: number) {
  return tonnes * KG_PER_TONNE;
}

export function padPressureKpa(reactionKn: number, padAreaM2: number) {
  if (!Number.isFinite(reactionKn) || reactionKn < 0) throw new Error("Reaction must be a finite non-negative value.");
  if (!Number.isFinite(padAreaM2) || padAreaM2 <= 0) throw new Error("Pad area must be greater than zero.");
  return reactionKn / padAreaM2 * KPA_PER_KN_PER_SQUARE_METRE;
}
