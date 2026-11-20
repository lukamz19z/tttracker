type LibraryOption = { id: string; name?: string; boom_configuration?: string; configuration_revision_id?: string; manufacturer_configuration?: { identityKey?: string } | null };
type TemplateElement = { mass_kg?: number | string };
type TemplatePhase = { phase_key: string; phase_name: string; main_load_share: number | string; auxiliary_load_share: number | string; radius_m?: number | string | null };
export type TemplateLiftRecord = {
  id: string; lift_number: string; sequence_no: number; description: string; lift_type: string;
  boom_configuration: string; maximum_radius_m?: number | string | null; default_radius_m?: number | string | null;
  effective_load_factor: number | string; default_rigging_arrangement_id?: string | null; notes?: string | null;
  elements?: TemplateElement[]; phases?: TemplatePhase[];
};
export type TemplateStudyOptions = { charts: LibraryOption[]; hooks: LibraryOption[]; ropes: LibraryOption[]; attachments: LibraryOption[] };

/** Convert reusable template data to the calculation request shape without adding engineering rules. */
export function mapTemplateLiftsToStudyInputs(rows: TemplateLiftRecord[], options: TemplateStudyOptions, configurationRevisionId: string) {
  return rows.map((row) => {
    let notes: Record<string, unknown> = {};
    if (typeof row.notes === "string" && row.notes.trim()) {
      try { notes = JSON.parse(row.notes) as Record<string, unknown>; } catch { /* Ordinary free-text notes are valid. */ }
    }
    const chart = options.charts.find((candidate) => candidate.boom_configuration === row.boom_configuration && candidate.configuration_revision_id === configurationRevisionId);
    const auxiliaryArrangementId = typeof notes.auxiliaryArrangementId === "string" ? notes.auxiliaryArrangementId : "";
    const mainHook = options.hooks.find((item) => item.name?.startsWith("Main single-sheave hook"));
    const auxiliaryHook = options.hooks.find((item) => item.name?.startsWith("Auxiliary headache ball"));
    const mainRope = options.ropes.find((item) => item.name?.startsWith("Main reeved rope tare"));
    const auxiliaryRope = options.ropes.find((item) => item.name?.startsWith("Auxiliary reeved rope tare"));
    const attachment = options.attachments.find((item) => item.name?.startsWith("Auxiliary single-sheave boom-top attachment"));
    if (!chart || !mainHook || !auxiliaryHook || !mainRope || !auxiliaryRope || !attachment || !row.default_rigging_arrangement_id || !auxiliaryArrangementId) {
      throw new Error(`Template lift ${row.lift_number} is missing a matched chart or crane/rigging component.`);
    }
    return {
      templateLiftId: row.id,
      liftNumber: row.lift_number,
      sequenceNo: Number(row.sequence_no),
      description: row.description,
      liftType: row.lift_type || "Custom",
      elementMassKg: (row.elements ?? []).reduce((sum, element) => sum + Number(element.mass_kg ?? 0), 0),
      effectiveLoadFactor: Number(row.effective_load_factor ?? 1),
      mainHookId: mainHook.id,
      mainRopeId: mainRope.id,
      mainAttachmentId: attachment.id,
      mainRiggingArrangementId: row.default_rigging_arrangement_id,
      auxiliaryHookId: auxiliaryHook.id,
      auxiliaryRopeId: auxiliaryRope.id,
      auxiliaryAttachmentId: attachment.id,
      auxiliaryRiggingArrangementId: auxiliaryArrangementId,
      chartId: chart.id,
      auxiliaryChartId: chart.id,
      configurationKey: chart.manufacturer_configuration?.identityKey ?? chart.boom_configuration,
      auxiliaryConfigurationKey: chart.manufacturer_configuration?.identityKey ?? chart.boom_configuration,
      externalReferenceReactions: Array.isArray(notes.externalReferenceReactions) ? notes.externalReferenceReactions : [],
      phases: (row.phases ?? []).map((phase) => ({
        key: phase.phase_key,
        name: phase.phase_name,
        loadShare: { main: Number(phase.main_load_share), auxiliary: Number(phase.auxiliary_load_share) },
        radiusM: Number(phase.radius_m ?? row.maximum_radius_m ?? row.default_radius_m ?? 0),
      })),
    };
  });
}
