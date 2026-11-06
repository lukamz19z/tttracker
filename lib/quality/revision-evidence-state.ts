export type RevisionEvidenceRole = "before_photo" | "after_photo";
export type RevisionEvidenceState = "none" | "before_only" | "after_only" | "complete";

export type RevisionEvidenceRow = {
  id?: string;
  revision_id: string | null;
  revision_item_id: string | null;
  file_role: string;
  deletion_pending?: boolean | null;
  is_outdated?: boolean | null;
  captured_at?: string | null;
  uploaded_by?: string | null;
  uploaded_by_label?: string | null;
  created_at?: string | null;
  evidence_metadata?: Record<string, unknown> | null;
};

export type RevisionEvidenceItem = {
  id: string;
  revision_id: string;
  status: string;
  issue_type_id?: string | null;
  other_issue_text?: string | null;
};

export function activeEvidenceForItem<T extends RevisionEvidenceRow>(item: RevisionEvidenceItem, rows: T[]) {
  return rows.filter(row => row.revision_id === item.revision_id && row.revision_item_id === item.id && row.deletion_pending !== true && row.is_outdated !== true && (row.file_role === "before_photo" || row.file_role === "after_photo"));
}

export function revisionEvidenceState(item: RevisionEvidenceItem, rows: RevisionEvidenceRow[]) {
  const active = activeEvidenceForItem(item, rows);
  const beforeCount = active.filter(row => row.file_role === "before_photo").length;
  const afterCount = active.filter(row => row.file_role === "after_photo").length;
  const state: RevisionEvidenceState = beforeCount && afterCount ? "complete" : beforeCount ? "before_only" : afterCount ? "after_only" : "none";
  const label = item.status === "Verified" ? "Verified" : item.status === "Rectified" ? "Rectified" : state === "complete" ? "Evidence complete" : state === "before_only" ? "Awaiting After" : state === "after_only" ? "Missing Before" : "No evidence";
  return { state, beforeCount, afterCount, label, active };
}

/** Deterministic choice matching the website's created_at-ascending evidence order: newest photo wins. */
export function selectCaptureEvidence<T extends RevisionEvidenceRow>(item: RevisionEvidenceItem, rows: T[], role: RevisionEvidenceRole): T | null {
  return activeEvidenceForItem(item, rows)
    .filter(row => row.file_role === role)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(a.id || "").localeCompare(String(b.id || "")))[0] || null;
}

export function historicalCaptureBackfill(item: Record<string, unknown>, before: RevisionEvidenceRow | null, after: RevisionEvidenceRow | null) {
  const patch: Record<string, unknown> = {};
  for (const [role, row] of [["before", before], ["after", after]] as const) {
    if (!row) continue;
    const capture = row.evidence_metadata || {};
    const capturedBy = typeof capture.capturedBy === "string" ? capture.capturedBy.trim() : "";
    const uploadedByLabel = String(row.uploaded_by_label || "").trim();
    const uploadedBy = row.uploaded_by || null;
    const prefix = role === "before" ? "before" : "after";
    const atKey = `${prefix}_taken_at`;
    const byKey = `${prefix}_taken_by`;
    const labelKey = `${prefix}_taken_by_label`;
    const metadataCaptureTime = typeof capture.capturedAt === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(capture.capturedAt) && !Number.isNaN(Date.parse(capture.capturedAt)) ? capture.capturedAt : null;
    if (item[atKey] == null && (row.captured_at || metadataCaptureTime)) patch[atKey] = row.captured_at || metadataCaptureTime;
    if (item[labelKey] == null && capturedBy) patch[labelKey] = capturedBy;
    // Link a capture-person UUID only when the recorded photographer label is an
    // exact match for the authenticated uploader label; otherwise identity is unknown.
    if (item[byKey] == null && capturedBy && uploadedBy && uploadedByLabel && capturedBy.toLocaleLowerCase() === uploadedByLabel.toLocaleLowerCase()) patch[byKey] = uploadedBy;
  }
  return patch;
}

export function hasCompleteHistoricalCaptureMetadata(item: Record<string, unknown>) {
  return ["before_taken_at", "before_taken_by", "before_taken_by_label", "after_taken_at", "after_taken_by", "after_taken_by_label"]
    .every(field => item[field] != null);
}

export function summarizeRevisionEvidence<T extends RevisionEvidenceItem>(items: T[], rows: RevisionEvidenceRow[]) {
  const counts = { eligible: 0, alreadyRectified: 0, alreadyRectifiedMetadataComplete: 0, verified: 0, noEvidence: 0, beforeOnly: 0, afterOnly: 0, skipped: 0, metadataRepairCandidates: 0, metadataRepairable: 0, metadataLocked: 0, metadataUnavailable: 0 };
  const eligibleItems: T[] = [];
  const skippedItems: Array<{ item: T; reason: string }> = [];
  const metadataRepairItems: Array<{ item: T; fields: string[]; missingFields: string[] }> = [];
  for (const item of items) {
    const evidence = revisionEvidenceState(item, rows);
    const metadata = historicalCaptureBackfill(item as T & Record<string, unknown>,
      selectCaptureEvidence(item, rows, "before_photo"), selectCaptureEvidence(item, rows, "after_photo"));
    const metadataFields = Object.keys(metadata);
    const missingFields: string[] = [];
    if (evidence.beforeCount) for (const field of ["before_taken_at", "before_taken_by", "before_taken_by_label"]) if ((item as T & Record<string, unknown>)[field] == null) missingFields.push(field);
    if (evidence.afterCount) for (const field of ["after_taken_at", "after_taken_by", "after_taken_by_label"]) if ((item as T & Record<string, unknown>)[field] == null) missingFields.push(field);
    if (missingFields.length) {
      counts.metadataRepairCandidates++;
      metadataRepairItems.push({ item, fields: metadataFields, missingFields });
      if (!metadataFields.length) counts.metadataUnavailable++;
      else if (item.status === "Verified") counts.metadataLocked++;
      else counts.metadataRepairable++;
    }
    if (evidence.state === "none") counts.noEvidence++;
    else if (evidence.state === "before_only") counts.beforeOnly++;
    else if (evidence.state === "after_only") counts.afterOnly++;

    if (item.status === "Rectified") {
      counts.alreadyRectified++;
      if (hasCompleteHistoricalCaptureMetadata(item as T & Record<string, unknown>)) counts.alreadyRectifiedMetadataComplete++;
      continue;
    }
    if (item.status === "Verified") { counts.verified++; continue; }
    if (item.status === "Open" && evidence.state === "complete" && Boolean(item.issue_type_id || item.other_issue_text?.trim())) {
      counts.eligible++;
      eligibleItems.push(item);
      continue;
    }

    counts.skipped++;
    const reason = evidence.state !== "complete" ? evidence.state : !item.issue_type_id && !item.other_issue_text?.trim() ? "issue_required" : item.status !== "Open" ? "status_not_open" : "not_eligible";
    skippedItems.push({ item, reason });
  }
  return { counts, eligibleItems, skippedItems, metadataRepairItems };
}
