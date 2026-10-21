export function integrationStatus(status?: string | null, platformReady = true, errorCategory?: string | null) {
  if (!platformReady) return "Platform Setup Required";
  if (errorCategory === "INTEGRATION_SITE_PERMISSION_REQUIRED") return "Permission Required";
  if (errorCategory === "INTEGRATION_RECONNECT_REQUIRED" || errorCategory === "refresh_failed") return "Reconnect Required";
  return ({ connected: "Connected", setup_required: "Setup Required", attention_required: "Attention Required", disconnected: "Not Connected", not_connected: "Not Connected", permission_required: "Permission Required" } as Record<string, string>)[status ?? ""] ?? "Not Connected";
}

export function integrationOrigin(value: string | undefined, environment: string | undefined) {
  if (!value) throw new Error("INTEGRATION_SETUP_REQUIRED");
  const url = new URL(value);
  const local = environment !== "production" && !process.env.VERCEL && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("INTEGRATION_SETUP_REQUIRED");
  return url.origin;
}
