export type Ladder = {
  id: string;
  ladder_number: string;
  make: string | null;
  ladder_type: string | null;
  height: string | null;
  crew_id: string | null;
  status: string | null;
  last_internal_inspection: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  supersedes_ladder_id: string | null;
  superseded_at: string | null;
};

export type LadderReference = Pick<Ladder, "id" | "ladder_number">;
export const ladderStatuses = ["Active", "Out of Service", "Missing", "Retired"];
export const ladderNumberKey = (value: string) => value.trim().toUpperCase();
export const ladderDetailHref = (id: string) => `/assets/equipment/records/ladder/${id}`;
export const duplicateLadderMessage = (number: string) =>
  `A ladder with register number ${number.trim()} already exists.`;

export function ladderRelations(item: Ladder, items: Ladder[]) {
  return {
    supersedes: items.find(row => row.id === item.supersedes_ladder_id) ?? null,
    supersededBy: items.find(row => row.supersedes_ladder_id === item.id) ?? null,
  };
}
