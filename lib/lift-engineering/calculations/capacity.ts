export function utilisationPercent(loadT: number, capacityT: number) {
  if (!Number.isFinite(loadT) || loadT < 0) throw new Error("Load must be non-negative.");
  if (!Number.isFinite(capacityT) || capacityT <= 0) throw new Error("Capacity must be greater than zero.");
  return loadT / capacityT * 100;
}
