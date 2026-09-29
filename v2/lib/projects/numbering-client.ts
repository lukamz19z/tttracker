export function renderProjectNumberTemplate(input: {
  template: string;
  clientCode?: string | null;
  year?: number | null;
  sequence?: number | null;
  prefix?: string | null;
  padding?: number;
}) {
  const year =
    input.year ??
    new Date().getFullYear();

  const sequence =
    input.sequence ?? 1;

  const client = String(
    input.clientCode ?? "",
  )
    .trim()
    .toUpperCase();

  const padding =
    input.padding ?? 3;

  const pad = (
    value: number,
    width: number,
  ) =>
    String(value).padStart(
      Math.max(
        1,
        Math.min(12, width),
      ),
      "0",
    );

  let output =
    input.template || "{SEQ:3}";

  output = output
    .replaceAll("{CLIENT}", client)
    .replaceAll(
      "{YYYY}",
      String(year),
    )
    .replaceAll(
      "{YY}",
      String(year).slice(-2),
    )
    .replaceAll(
      "{PREFIX}",
      input.prefix ?? "",
    )
    .replace(
      /\{SEQ:(\d+)\}/g,
      (_, width) =>
        pad(
          sequence,
          Number(width) ||
            padding,
        ),
    )
    .replaceAll(
      "{SEQ}",
      pad(sequence, padding),
    );

  return output
    .replace(/--+/g, "-")
    .replace(/__+/g, "_")
    .replace(/^-+|-+$/g, "")
    .trim();
}
