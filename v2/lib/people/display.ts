/** Presentation only; never changes canonical values. */
const labels: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
  automatic: "Automatic",
  manual: "Manual",
  never: "No expiry",
  single: "Single document",
  front_back: "Front & Back",
  single_or_front_back: "Single or Front & Back",
  pending_review: "Pending Review",
  changes_required: "Changes Required",
  trusted: "Trusted Confirmation",
  required: "Review Required",
  none: "None",
  inherit: "Organisation Default",
  approved: "Approved",
  rejected: "Rejected",
  not_required: "Not Required",
  no_record: "No Record",
  no_account: "No account",
  admin_entry: "Internal Entry",
  external_onboarding: "Secure Onboarding",
  mobile: "Mobile Upload",
  person_web: "Person Web Upload",
  internal: "Internal",
  sharepoint: "SharePoint",
  in_progress: "In Progress",
  under_review: "Under Review",
  sent: "Sent",
  invited: "Invited",
  completed: "Completed",
  draft: "Draft",
  expired: "Expired",
  revoked: "Revoked",
  current: "Current",
  expiring: "Expiring",
  operational: "Operational",
  private: "Private",
  confidential: "Confidential",
};
export function peopleLabel(value: string): string {
  if (value.includes(" ") && !value.includes("_")) return value;
  return (
    labels[value] ??
    value.replaceAll("_", " ").replace(/\b[a-z]/g, (c) => c.toUpperCase())
  );
}
export function peopleDisplay(value: string, key: string): string {
  if (key === "review_policy" && value === "none") return "No Review Required";
  if (key === "document_requirement" && value === "none")
    return "No evidence required";
  return /status|policy|mode|requirement|source_channel|classification|^side$|^action$/.test(
    key,
  )
    ? peopleLabel(value)
    : value;
}
