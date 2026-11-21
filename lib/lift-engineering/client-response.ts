type ResponseLike = Pick<Response, "status" | "ok" | "text">;

function safeMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    if (typeof body[key] === "string" && body[key].trim()) return body[key].trim();
  }
  return null;
}

function preview(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  return compact.length > 500 ? `${compact.slice(0, 497)}...` : compact;
}

/** Read JSON responses without allowing empty, proxy, or malformed bodies to mask the HTTP failure. */
export async function readLiftJson<T>(response: ResponseLike, operation: string): Promise<T | null> {
  const text = await response.text();
  if (response.status === 204) return null;
  if (!text.trim()) throw new Error(`${operation} failed (${response.status}): The server returned an empty response.`);

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    const detail = preview(text);
    throw new Error(`${operation} failed (${response.status}): The server returned invalid JSON${detail ? `: ${detail}` : "."}`);
  }

  if (!response.ok) {
    const message = safeMessage(payload) ?? (preview(text) || "The request was rejected.");
    throw new Error(`${operation} failed (${response.status}): ${message}`);
  }
  return payload as T;
}
