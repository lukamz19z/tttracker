import { isEmptySourceRow } from "./import-validation";
import type { CsvRow } from "@/lib/towers/csv";

/** Strict Materials parser: malformed CSV must fail before any import writes. */
export function parseMaterialsCsv(text: string): { headers: string[]; rows: CsvRow[]; sourceRowNumbers: number[]; ignoredEmptyRows: number } {
  const records: Array<{ cells: string[]; line: number }> = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let startLine = 1;
  let ignoredEmptyRows = 0;
  const input = text.replace(/^\uFEFF/, "");
  function finishField() {
    cells.push(field);
    field = "";
    closedQuote = false;
  }
  function finishRecord() {
    finishField();
    if (!isEmptySourceRow(cells)) records.push({ cells, line: startLine });
    else if (records.length) ignoredEmptyRows += 1;
    cells = [];
    startLine = line + 1;
  }
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else {
        field += character;
        if (character === "\n") line += 1;
      }
    } else if (character === '"') {
      if (field.trim() || closedQuote) throw new Error(`CSV line ${line}: unexpected quote.`);
      field = "";
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      finishRecord();
      line += 1;
    } else {
      if (closedQuote && character.trim()) throw new Error(`CSV line ${line}: text after closing quote.`);
      if (!closedQuote) field += character;
    }
  }
  if (quoted) throw new Error(`CSV line ${startLine}: unclosed quoted field.`);
  if (cells.length || field.length || closedQuote) finishRecord();
  const headers = records[0]?.cells.map(header => header.trim()) ?? [];
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV requires nonblank column headings.");
  const normalized = headers.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== headers.length) throw new Error("CSV has duplicate column headings; rename them before importing.");
  const rows = records.slice(1).map((record) => {
    if (record.cells.length !== headers.length) {
      throw new Error(`CSV line ${record.line}: expected ${headers.length} columns, found ${record.cells.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, record.cells[index]]));
  });
  return { headers, rows, sourceRowNumbers: records.slice(1).map((record) => record.line), ignoredEmptyRows };
}
