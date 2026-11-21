export type TowerSectionInput = {
  id: string;
  name: string;
  category?: string | null;
  quantity: number;
  unit_weight_kg: number;
  active?: boolean;
};

export type LiftSectionAllocation = {
  tower_template_section_id: string;
  allocated_quantity: number;
  portion: number;
};

export function towerSectionWeightKg(section: Pick<TowerSectionInput, "quantity" | "unit_weight_kg">): number {
  if (!Number.isFinite(section.quantity) || section.quantity <= 0 || !Number.isFinite(section.unit_weight_kg) || section.unit_weight_kg < 0) {
    throw new Error("Tower section quantity and unit weight must be valid non-negative engineering values.");
  }
  return section.quantity * section.unit_weight_kg;
}

export function towerTemplateWeightKg(sections: TowerSectionInput[]): number {
  return sections.filter((section) => section.active !== false).reduce((total, section) => total + towerSectionWeightKg(section), 0);
}

export function liftTemplateSteelWeightKg(
  allocations: LiftSectionAllocation[],
  sections: TowerSectionInput[],
  additionalMassKg = 0,
): number {
  if (!Number.isFinite(additionalMassKg) || additionalMassKg < 0) throw new Error("Additional lift steel mass must be zero or greater.");
  const byId = new Map(sections.map((section) => [section.id, section]));
  return allocations.reduce((total, allocation) => {
    const section = byId.get(allocation.tower_template_section_id);
    if (!section || section.active === false) throw new Error("Lift allocation refers to an unavailable tower section.");
    if (!Number.isFinite(allocation.allocated_quantity) || allocation.allocated_quantity <= 0 || allocation.allocated_quantity > section.quantity) {
      throw new Error(`Allocated quantity for ${section.name} must be greater than zero and no more than the section quantity.`);
    }
    if (!Number.isFinite(allocation.portion) || allocation.portion <= 0 || allocation.portion > 1) throw new Error("Section portion must be greater than zero and no more than 100%.");
    return total + allocation.allocated_quantity * section.unit_weight_kg * allocation.portion;
  }, additionalMassKg);
}

export function snapshotTowerAndLiftTemplate(input: {
  towerTemplateId: string;
  towerTemplateRevisionId: string;
  liftTemplateId: string;
  liftTemplateRevisionId: string;
  lifts: Array<Record<string, unknown>>;
  sections: Array<Record<string, unknown>>;
}) {
  return JSON.parse(JSON.stringify({ ...input, snapshotVersion: 1 })) as typeof input & { snapshotVersion: number };
}

export function duplicateLiftTemplatePayload<T extends { name: string }>(template: T, name: string) {
  return { ...template, id: undefined, name: name.trim(), active: true };
}
