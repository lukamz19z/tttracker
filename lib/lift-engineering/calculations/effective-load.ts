export function effectiveElementMassKg(elementMassKg: number, factor: number) {
  if (!Number.isFinite(elementMassKg) || elementMassKg < 0) throw new Error("Element mass must be a finite non-negative value.");
  if (!Number.isFinite(factor) || factor < 0) throw new Error("Effective load factor must be a finite non-negative value.");
  return elementMassKg * factor;
}
