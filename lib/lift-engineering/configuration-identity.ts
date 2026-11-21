export type ConfigurationBaseIdentity = {
  craneProfileId: string;
  counterweightT: number | null;
  outriggerState: string | null;
  outriggerLengthM: number | null;
  outriggerWidthM: number | null;
  slewRange: string | null;
};

function normalizedNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-AU") : "";
}

export function configurationBaseIdentityKey(identity: ConfigurationBaseIdentity): string {
  const hasDimensions = normalizedNumber(identity.outriggerLengthM) !== null && normalizedNumber(identity.outriggerWidthM) !== null;
  return JSON.stringify([
    identity.craneProfileId.trim(),
    normalizedNumber(identity.counterweightT),
    hasDimensions
      ? [normalizedNumber(identity.outriggerLengthM), normalizedNumber(identity.outriggerWidthM)]
      : normalizedText(identity.outriggerState),
    normalizedText(identity.slewRange),
  ]);
}

export function sameConfigurationBase(left: ConfigurationBaseIdentity, right: ConfigurationBaseIdentity): boolean {
  return configurationBaseIdentityKey(left) === configurationBaseIdentityKey(right);
}
