const listKeys = [
  "q",
  "page",
  "status",
  "date",
  "person",
  "from_date",
  "to_date",
  "project_id",
  "crew_id",
  "training_type_id",
  "relationship_type_id",
  "review_status",
  "source_channel",
  "category_id",
  "option_id",
];
export function peopleListHref(
  organisation: string,
  section = "people",
  state: Record<string, string> = {},
) {
  const params = new URLSearchParams({ organisation, section });
  for (const key of listKeys) if (state[key]) params.set(key, state[key]);
  return `/workspace/people?${params}`;
}
export function safePeopleBack(raw: string | undefined, organisation: string) {
  if (!raw) return peopleListHref(organisation);
  try {
    const url = new URL(raw, "https://tttracker.invalid");
    if (
      url.origin !== "https://tttracker.invalid" ||
      url.pathname !== "/workspace/people" ||
      url.searchParams.get("organisation") !== organisation
    )
      return peopleListHref(organisation);
    const section = url.searchParams.get("section") ?? "people";
    if (
      ![
        "people",
        "crews",
        "training",
        "review",
        "requirements",
        "onboarding",
        "prestarts",
        "matrix",
      ].includes(section)
    )
      return peopleListHref(organisation);
    return peopleListHref(
      organisation,
      section,
      Object.fromEntries(url.searchParams),
    );
  } catch {
    return peopleListHref(organisation);
  }
}
