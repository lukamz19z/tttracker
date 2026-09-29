export type CsvRow =
  Record<string, string>;

export function parseCsv(
  text: string,
): {
  headers: string[];
  rows: CsvRow[];
} {
  const records: string[][] = [];

  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];
    const next =
      text[index + 1];

    if (character === '"') {
      if (
        quoted &&
        next === '"'
      ) {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (
      character === "," &&
      !quoted
    ) {
      row.push(field);
      field = "";
      continue;
    }

    if (
      (character === "\n" ||
        character === "\r") &&
      !quoted
    ) {
      if (
        character === "\r" &&
        next === "\n"
      ) {
        index += 1;
      }

      row.push(field);

      if (
        row.some(
          (value) =>
            value.trim() !== "",
        )
      ) {
        records.push(row);
      }

      row = [];
      field = "";
      continue;
    }

    field += character;
  }

  row.push(field);

  if (
    row.some(
      (value) =>
        value.trim() !== "",
    )
  ) {
    records.push(row);
  }

  const rawHeaders =
    records[0] ?? [];

  const headers =
    rawHeaders.map(
      (header, index) =>
        header.trim() ||
        `Column ${index + 1}`,
    );

  const rows = records
    .slice(1)
    .map((values) => {
      const output: CsvRow = {};

      headers.forEach(
        (header, index) => {
          output[header] =
            values[index]?.trim() ??
            "";
        },
      );

      return output;
    });

  return {
    headers,
    rows,
  };
}

export function normalizeHeader(
  value: string,
) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
