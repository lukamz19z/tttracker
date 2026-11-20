import { jsPDF } from "jspdf";

export function generateLiftStudyPdf(snapshot: Record<string, unknown>) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const width = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 20;
  const line = (text: string, bold = false) => {
    if (y > 278) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 11 : 9);
    doc.text(text, margin, y, { maxWidth: width - margin * 2 }); y += bold ? 7 : 5;
  };
  line("LIFT STUDY — ENGINEERING CALCULATION RECORD", true);
  line(`Study: ${String(snapshot.studyNumber ?? "Unnumbered")}`);
  line(`Title: ${String(snapshot.title ?? "Lift Study")}`);
  line(`Revision: ${String(snapshot.revisionLabel ?? "Draft")}`);
  line(`Status: ${String(snapshot.status ?? "Draft")}`);
  line("");
  line("Crane and configuration", true);
  for (const [label, value] of Object.entries((snapshot.crane as Record<string, unknown> | undefined) ?? {})) line(`${label}: ${String(value ?? "—")}`);
  line(""); line("Lift sequence", true);
  const lifts = Array.isArray(snapshot.lifts) ? snapshot.lifts as Array<Record<string, unknown>> : [];
  for (const lift of lifts) {
    line(`${String(lift.liftNumber ?? "Lift")} — ${String(lift.description ?? "")}`, true);
    line(`Governing phase: ${String(lift.governingPhaseKey ?? "—")} | utilisation: ${lift.governingUtilisationPct == null ? "Not calculated" : `${Number(lift.governingUtilisationPct).toFixed(2)}%`}`);
    const phases = Array.isArray(lift.phases) ? lift.phases as Array<Record<string, unknown>> : [];
    for (const phase of phases) line(`${String(phase.phaseName)}: load ${Number(phase.mainTotalLoadT ?? 0).toFixed(2)} t; required radius ${Number(phase.requiredRadiusM ?? 0).toFixed(2)} m; chart ${phase.chartRadiusM ?? "—"} m @ ${phase.chartCapacityT ?? "—"} t`);
  }
  line(""); line("Methodology and source references", true);
  line(`Calculation engine: ${String(snapshot.calculationEngineVersion ?? "v1.0.0")}`);
  line(`Methodology version: ${String(snapshot.methodologyVersion ?? "v1-parity-unverified")}`);
  line("Chart capacity selection uses the next manufacturer chart radius at or above the required radius; no capacity interpolation is applied.");
  line("Outrigger reactions are not independently calculated or approved by this report.");
  line(""); line("Review / approval", true);
  for (const entry of Array.isArray(snapshot.reviews) ? snapshot.reviews as Array<Record<string, unknown>> : []) line(`${String(entry.action)} — ${String(entry.actorLabel ?? "")}; ${String(entry.createdAt ?? "")}`);
  return Buffer.from(doc.output("arraybuffer"));
}
