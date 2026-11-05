function quantity(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/** Current actionable quantity; cancellation keeps history but closes the balance. */
export function remainingMaterialIssueQuantity(
  status: unknown,
  original: unknown,
  receivedOrCollected: unknown,
  reserved = 0,
) {
  if (String(status ?? "").trim().toLowerCase() === "cancelled") return 0;
  return Math.max(0, quantity(original) - quantity(receivedOrCollected) - quantity(reserved));
}
