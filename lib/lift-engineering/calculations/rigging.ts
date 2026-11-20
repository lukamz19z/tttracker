import type { RiggingComponent } from "../types.ts";

export function totalRiggingTareKg(components: RiggingComponent[]) {
  return components.reduce((sum, component) => {
    if (!Number.isFinite(component.quantity) || component.quantity <= 0) throw new Error(`Rigging quantity must be positive for ${component.id}.`);
    const unitMass = component.massOverrideKg ?? component.massKg;
    if (!Number.isFinite(unitMass) || unitMass < 0) throw new Error(`Rigging mass must be non-negative for ${component.id}.`);
    return sum + component.quantity * unitMass;
  }, 0);
}
