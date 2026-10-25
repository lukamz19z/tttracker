export type RevisionWorkingLocation = {
  updatedAt?: string;
  keepSegment: boolean;
  keepLeg: boolean;
  segment: string;
  leg: string | null;
};
export function nextFindingLocation(location?: RevisionWorkingLocation) {
  return { towerSegment: location?.keepSegment ? location.segment : "", leg: location?.keepLeg ? location.leg : null };
}
export function savedFindingLocation(location: RevisionWorkingLocation | undefined, segment: string, leg: string | null): RevisionWorkingLocation {
  return { updatedAt:new Date().toISOString(), keepSegment: location?.keepSegment ?? false, keepLeg: location?.keepLeg ?? false, segment: location?.keepSegment ? segment : "", leg: location?.keepLeg ? leg : null };
}
