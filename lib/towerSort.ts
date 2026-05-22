export function naturalSortText(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function getTowerDisplayName(tower: {
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  name?: string | null;
}) {
  return (
    tower.tower_number ||
    tower.structure_number ||
    tower.tower_no ||
    tower.name ||
    "Unnamed Tower"
  );
}

export function sortTowersNaturally<T extends {
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  name?: string | null;
}>(towers: T[]) {
  return [...towers].sort((a, b) =>
    naturalSortText(getTowerDisplayName(a), getTowerDisplayName(b))
  );
}