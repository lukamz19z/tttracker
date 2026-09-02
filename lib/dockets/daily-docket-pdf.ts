import { jsPDF } from "jspdf";

type Row = Record<string, unknown>;
type MaterialEvent = Row & {
  tower_material_event_items?: Row[] | null;
  tower_material_event_people?: Row[] | null;
  tower_material_event_plant?: Row[] | null;
};

export type DailyDocketPdfData = {
  project: Row;
  tower: Row;
  docket: Row;
  labour: Row[];
  plant: Row[];
  delays: Row[];
  progress: Row[];
  materialEvents: MaterialEvent[];
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const [year, month, day] = raw.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function formatHours(value: unknown) {
  return number(value).toFixed(2);
}

function durationHours(start: unknown, finish: unknown) {
  const a = Date.parse(text(start));
  const b = Date.parse(text(finish));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 3_600_000;
}

function titleCase(value: unknown) {
  return text(value)
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function generateDailyDocketPdf(data: DailyDocketPdfData): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const marginX = 14;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - marginX * 2;
  let y = 16;

  function ensureSpace(height = 8) {
    if (y + height <= pageHeight - 15) return;
    doc.addPage();
    y = 16;
  }

  function heading(value: string, size = 14) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(value, marginX, y);
    y += size >= 16 ? 8 : 7;
  }

  function paragraph(value: string, bold = false) {
    if (!value) return;
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(value, contentWidth) as string[];
    ensureSpace(lines.length * 4.5 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 4.5 + 2;
  }

  function rule() {
    ensureSpace(5);
    doc.setDrawColor(190);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  }

  const projectName = [text(data.project.project_number), text(data.project.name)]
    .filter(Boolean)
    .join(" - ");
  const towerName =
    text(data.tower.name) ||
    text(data.tower.tower_number) ||
    text(data.tower.structure_number) ||
    "Tower";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("BC CONTRACTING - DAILY DOCKET", marginX, y);
  y += 9;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(projectName || "Project", marginX, y);
  y += 5;
  doc.text(`${towerName} | ${formatDate(data.docket.docket_date)}`, marginX, y);
  y += 7;
  rule();

  heading("Docket Details");
  paragraph(`Crew: ${text(data.docket.crew) || "-"}`);
  paragraph(`Leading Hand: ${text(data.docket.leading_hand) || "-"}`);
  paragraph(`Weather: ${text(data.docket.weather) || "-"}`);
  paragraph(`BC Representative: ${text(data.docket.bc_rep_name) || "-"}`);
  paragraph(`Client Representative: ${text(data.docket.client_rep_name) || "-"}`);

  heading("Progress");
  for (const row of data.progress) {
    paragraph(
      `${text(row.section_label) || "Section"} - Assembled: ${text(row.assembled_qty) || "0"}, Erected: ${text(row.erected_qty) || "0"}`,
    );
  }
  paragraph(
    `Overall Assembly: ${number(data.docket.assembly_percent).toFixed(1)}% | Overall Erection: ${number(data.docket.erection_percent).toFixed(1)}%`,
    true,
  );

  heading("Labour");
  if (!data.labour.length) paragraph("No labour rows recorded.");
  for (const row of data.labour) {
    paragraph(
      [
        text(row.worker_name) || "Worker",
        `${text(row.time_in) || "-"} - ${text(row.time_out) || "-"}`,
        `Raw ${formatHours(row.total_hours)} h`,
        `Production ${formatHours(row.production_hours)} h`,
        number(row.delay_hours) > 0 ? `Delay ${formatHours(row.delay_hours)} h` : "",
      ].filter(Boolean).join(" | "),
    );
  }
  paragraph(
    `Raw man-hours: ${formatHours(data.docket.raw_manhours)} | Production man-hours: ${formatHours(data.docket.production_manhours)}`,
    true,
  );

  heading("Plant");
  if (!data.plant.length) paragraph("No plant recorded.");
  for (const row of data.plant) {
    paragraph(
      [
        text(row.plant_name) || text(row.asset_number) || text(row.asset_id) || "Plant",
        text(row.plant_type),
        `${text(row.time_in) || "-"} - ${text(row.time_out) || "-"}`,
        `${formatHours(row.total_hours)} h`,
      ].filter(Boolean).join(" | "),
    );
  }

  heading("Delays & Issues");
  if (!data.delays.length) paragraph("No general delay rows recorded.");
  for (const row of data.delays) {
    paragraph(
      [
        titleCase(row.delay_type) || "Delay",
        `${formatHours(row.delay_hours)} h`,
        text(row.delay_reason),
        Array.isArray(row.worker_names) && row.worker_names.length ? `Workers: ${row.worker_names.join(", ")}` : "",
        Array.isArray(row.plant_names) && row.plant_names.length ? `Plant: ${row.plant_names.join(", ")}` : "",
      ].filter(Boolean).join(" | "),
    );
  }
  if (text(data.docket.delays_comments)) {
    paragraph(`General site comment: ${text(data.docket.delays_comments)}`);
  }

  heading("Material Events");
  if (!data.materialEvents.length) paragraph("No structured material events recorded.");
  for (const event of data.materialEvents) {
    paragraph(
      [titleCase(event.event_type) || "Material Event", text(event.affected_activity), text(event.affected_section)]
        .filter(Boolean)
        .join(" - "),
      true,
    );

    for (const item of event.tower_material_event_items ?? []) {
      paragraph(
        `• ${number(item.quantity)} ${text(item.unit) || "x"} ${text(item.item_reference)}${text(item.item_description) ? ` - ${text(item.item_description)}` : ""}`,
      );
    }

    const people = event.tower_material_event_people ?? [];
    if (people.length) {
      const personHours = people.reduce((sum, person) => {
        return sum + (durationHours(person.started_at, person.finished_at) ?? 0);
      }, 0);
      paragraph(
        `People involved: ${people.map((person) => text(person.employee_name)).filter(Boolean).join(", ")} | Calculated person-hours: ${personHours.toFixed(2)}`,
      );
    }

    for (const item of event.tower_material_event_plant ?? []) {
      const hours = durationHours(item.started_at, item.finished_at);
      paragraph(
        `Plant affected: ${text(item.plant_name) || "Plant"}${hours !== null ? ` | ${hours.toFixed(2)} h` : ""}`,
      );
    }

    if (text(event.work_outcome)) paragraph(`Work outcome: ${titleCase(event.work_outcome)}`);
    if (text(event.commercial_impact_type)) paragraph(`Commercial impact: ${titleCase(event.commercial_impact_type)}`);
    if (text(event.current_effect)) paragraph(`Current effect: ${titleCase(event.current_effect)}`);
    if (Array.isArray(event.mitigation_actions) && event.mitigation_actions.length) {
      paragraph(`Mitigation: ${event.mitigation_actions.map(titleCase).join(", ")}`);
    }
    if (text(event.notes)) paragraph(`Notes: ${text(event.notes)}`);
  }

  heading("Safety");
  paragraph(`Incident occurred: ${data.docket.incident_occurred ? "Yes" : "No"}`);
  if (data.docket.incident_occurred) {
    if (text(data.docket.incident_type)) paragraph(`Incident type: ${text(data.docket.incident_type)}`);
    if (text(data.docket.incident_notes)) paragraph(`Incident notes: ${text(data.docket.incident_notes)}`);
  }

  rule();
  doc.setFontSize(7.5);
  paragraph("Generated by TTTracker from the submitted Daily Docket record. Uncontrolled when printed.");

  return new Uint8Array(doc.output("arraybuffer"));
}