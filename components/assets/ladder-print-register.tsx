import { ladderHeightLabel, ladderMeasurementLabel, ladderRelations, type Ladder } from "@/lib/assets/ladders";

// Follows V1 Lifting Gear's print-area / window.print() register pattern.
export const ladderPrintCss = `
  @media print {
    @page { size: landscape; margin: 8mm; }
    body * { visibility: hidden; }
    body:has(.ladder-print-area) header,
    body:has(.ladder-print-area) nav,
    body:has(.ladder-print-area) aside,
    .ladder-screen-only { display: none !important; }
    .print-area.ladder-print-area, .print-area.ladder-print-area * { visibility: visible; }
    .print-area.ladder-print-area {
      display: block !important; position: absolute; left: 0; top: 0;
      width: 100%; padding: 12px; box-sizing: border-box; background: white;
      color: #0f172a; font-family: Arial, sans-serif;
    }
    .ladder-print-area .print-brand { margin: 0 0 4px; font-size: 11px; font-weight: 800; }
    .ladder-print-area h1 { margin: 0; font-size: 20px; font-weight: 900; }
    .ladder-print-area .print-meta { margin: 4px 0; font-size: 11px; color: #475569; }
    .ladder-print-area .print-heading { margin-bottom: 14px; break-inside: avoid; }
    .ladder-print-area table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; text-align: left; }
    .ladder-print-area thead { display: table-header-group; }
    .ladder-print-area tr { break-inside: avoid; page-break-inside: avoid; }
    .ladder-print-area th, .ladder-print-area td {
      border: 1px solid #cbd5e1; padding: 4px 5px; vertical-align: top;
      line-height: 1.25; overflow-wrap: anywhere; word-break: break-word;
    }
    .ladder-print-area th { background: #f1f5f9; font-weight: 800; text-transform: uppercase; }
  }
`;

export function LadderPrintRegister({ items, allItems, crewLabel, inspectionLabel, printedAt, filterSummary }: {
  items: Ladder[];
  allItems: Ladder[];
  crewLabel: (item: Ladder) => string;
  inspectionLabel: (value: string | null) => string;
  printedAt: string;
  filterSummary: string;
}) {
  return <>
    <section className="print-area ladder-print-area hidden" aria-label="Ladder Register print view">
      <div className="print-heading">
        <p className="print-brand">TTTracker</p>
        <h1>Ladder Register</h1>
        <p className="print-meta">{items.length} filtered ladder(s)</p>
        <p className="print-meta">Generated: {printedAt}</p>
        <p className="print-meta">Filters: {filterSummary || "All ladders"}</p>
      </div>
      <table>
        <colgroup>{[9, 10, 7, 10, 7, 11, 8, 7, 10, 9, 12].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{["Ladder ID", "Serial Number", "Make", "Ladder Type", "Height", "Measurement", "Crew", "Status", "Last Inspection", "Inspection Status", "Replacement"].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{items.map(item => {
          const relations = ladderRelations(item, allItems);
          return <tr key={item.id}>
            <td>{item.ladder_number}</td>
            <td>{item.serial_number?.trim() || "\u2014"}</td>
            <td>{item.make || "\u2014"}</td>
            <td>{item.ladder_type || "\u2014"}</td>
            <td>{ladderHeightLabel(item.height)}</td>
            <td>{ladderMeasurementLabel(item.height_measurement_type)}</td>
            <td>{crewLabel(item)}</td>
            <td>{item.status || "Active"}</td>
            <td>{item.last_internal_inspection ? new Date(`${item.last_internal_inspection}T00:00:00`).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "\u2014"}</td>
            <td>{inspectionLabel(item.last_internal_inspection)}</td>
            <td>{relations.supersedes ? <div>Supersedes {relations.supersedes.ladder_number}</div> : null}{relations.supersededBy ? <div>Superseded by {relations.supersededBy.ladder_number}</div> : null}{!relations.supersedes && !relations.supersededBy ? "\u2014" : null}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <style>{ladderPrintCss}</style>
  </>;
}
