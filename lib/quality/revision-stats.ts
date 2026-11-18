export type RevisionStatItem = {
  status: string;
  issue_type_id?: string | null;
  other_issue_text?: string | null;
  tower_segment?: string | null;
  source_type?: string | null;
  source_payload?: Record<string, unknown> | null;
};

function sectionForStats(item: RevisionStatItem) {
  const fallback = item.tower_segment?.trim() || "";
  if (item.source_type !== "punchlist") return fallback;
  const payload = item.source_payload;
  const sourceSection = payload && typeof payload === "object"
    ? payload.sourceSection ?? payload.source_section ?? payload.segment
    : null;
  return typeof sourceSection === "string" ? sourceSection.trim() : fallback;
}

export type RevisionStatRow = { label: string; count: number; percent: number };

export type RevisionStats = {
  total: number;
  open: number;
  completed: number;
  mostCommonIssue: RevisionStatRow | null;
  issueTypes: RevisionStatRow[];
  sections: RevisionStatRow[];
  statuses: RevisionStatRow[];
};

function rows(counts: Map<string, number>, total: number): RevisionStatRow[] {
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** Whole-revision report. List search and facet selections intentionally do not alter these totals. */
export function buildRevisionStats<T extends RevisionStatItem>(
  items: T[],
  issueTypes: Array<{ id: string; name: string }>,
): RevisionStats {
  const names = new Map(issueTypes.map((issue) => [issue.id, issue.name]));
  const issues = new Map<string, number>();
  const sections = new Map<string, number>();
  const statuses = new Map<string, number>();

  for (const item of items) {
    const issue = names.get(item.issue_type_id || "") || item.other_issue_text?.trim() || "Other";
    const section = sectionForStats(item) || "No section";
    issues.set(issue, (issues.get(issue) || 0) + 1);
    sections.set(section, (sections.get(section) || 0) + 1);
    statuses.set(item.status || "Unknown", (statuses.get(item.status || "Unknown") || 0) + 1);
  }

  const issueRows = rows(issues, items.length);
  return {
    total: items.length,
    open: items.filter((item) => item.status === "Open").length,
    completed: items.filter((item) => item.status === "Rectified" || item.status === "Verified").length,
    mostCommonIssue: issueRows[0] || null,
    issueTypes: issueRows,
    sections: rows(sections, items.length),
    statuses: rows(statuses, items.length),
  };
}

export function buildProjectRevisionStats<T extends RevisionStatItem>(
  items: T[],
  statsProjectId: string | null | undefined,
  currentProjectId: string | null | undefined,
  issueTypes: Array<{ id: string; name: string }>,
): RevisionStats {
  return statsProjectId && currentProjectId && statsProjectId === currentProjectId
    ? buildRevisionStats(items, issueTypes)
    : buildRevisionStats([], issueTypes);
}

export type CountedOption = { value: string; count: number };

/** Keep positive facets and retain a currently selected facet even when its count reaches zero. */
export function keepAvailableOptions<T extends CountedOption>(options: T[], selected: string): T[] {
  return options.filter((option) => option.count > 0 || (Boolean(selected) && option.value === selected));
}
