import type { ProjectAccess } from "./access";

// Project-party capabilities and shares are always bound to the same participant identity.
export function selectProjectParticipant(access: ProjectAccess, organisationId?: string | null): ProjectAccess | null {
  if (access.kind === "host") return !organisationId || organisationId === access.dataOrganisationId ? access : null;
  const party = access.parties.find((row) => !organisationId || row.organisationId === organisationId || row.id === organisationId);
  if (!party) return null;
  return { ...access, parties: [party], permissions: party.permissions,
    shares: access.shares.filter((share) => share.partyId === party.id) };
}
