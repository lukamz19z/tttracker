export type BackendFailureKind = "http" | "postgrest" | "network" | "timeout";
export type BackendFailure = { transient: boolean; kind?: BackendFailureKind; status?: number; code?: string };

const RETRY_DELAYS_MS = [300, 700, 1_500] as const;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 20_000;
// A safe read has one 15s end-to-end budget (including retries and jitter).
// Mutations receive their own explicit budget from the caller and are never
// retried, deduplicated, or blocked by the read circuit.
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MUTATION_TIMEOUT_MS = 30_000;
const MAX_ATTEMPT_TIMEOUT_MS = 6_000;

function errorFields(value: unknown): { status?: number; code?: string; message: string } {
  if (value instanceof Response) return { status: value.status, message: "" };
  if (!value || typeof value !== "object") return { message: String(value ?? "") };
  const row = value as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const status = Number(row.status ?? row.statusCode);
  const code = typeof row.code === "string" ? row.code : undefined;
  const message = [row.message, row.cause instanceof Error ? row.cause.message : ""].filter(Boolean).join(" ");
  return { ...(Number.isFinite(status) && status > 0 ? { status } : {}), ...(code ? { code } : {}), message };
}

function safeRequestPath(value: string) {
  try {
    return new URL(value, "https://tttracker.invalid")
      .pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
      .replace(/\/(\d{5,})(?=\/|$)/g, "/[id]");
  } catch {
    return "[unknown-path]";
  }
}

export function classifyBackendFailure(value: unknown): BackendFailure {
  const fields = errorFields(value);
  const combined = `${fields.code ?? ""} ${fields.message}`.toLowerCase();
  if (fields.code?.toUpperCase() === "PGRST116" || [400, 401, 403, 404].includes(fields.status ?? 0)) {
    return { transient: false, ...(fields.status ? { status: fields.status } : {}), ...(fields.code ? { code: fields.code } : {}) };
  }
  const postgrest = combined.match(/\bpgrst00[0-2]\b/i)?.[0]?.toUpperCase();
  if (postgrest) return { transient: true, kind: "postgrest", ...(fields.status ? { status: fields.status } : {}), code: postgrest };
  if ([502, 503, 504].includes(fields.status ?? 0)) return { transient: true, kind: "http", status: fields.status };
  if (fields.status === 408 || /timed? ?out|timeout|connection reset|network request failed|failed to fetch|fetch failed|socket hang up|econnreset|enotfound|eai_again/i.test(combined)) {
    return { transient: true, kind: /timed? ?out|timeout/i.test(combined) ? "timeout" : "network", ...(fields.status ? { status: fields.status } : {}), ...(fields.code ? { code: fields.code } : {}) };
  }
  if (value instanceof TypeError && /fetch|network/i.test(value.message)) return { transient: true, kind: "network" };
  return { transient: false, ...(fields.status ? { status: fields.status } : {}), ...(fields.code ? { code: fields.code } : {}) };
}

export function retryDelayMs(retryIndex: number, random = Math.random) {
  const base = RETRY_DELAYS_MS[Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, retryIndex))];
  return Math.round(base * (0.8 + random() * 0.4));
}

export class BackendRequestTimeoutError extends Error {
  readonly code = "TT_BACKEND_TIMEOUT";
  readonly transient = true;
  readonly timeout = true;
  readonly timeoutMs: number;
  constructor(timeoutMs: number, cause?: unknown) {
    super("The request timed out. Please retry.", { cause });
    this.name = "BackendRequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

type ResilienceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  timeoutMs?: number;
  log?: (event: string, fields: Record<string, unknown>) => void;
  circuitBreaker?: boolean;
};

type ResilientRequestInit = RequestInit & { resilienceTimeoutMs?: number };

type CircuitState = { consecutiveFailures: number; openedUntil: number; probeInFlight: boolean };

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Request aborted", "AbortError"));
    const timer = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", abort); resolve(); }
    function abort() { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new DOMException("Request aborted", "AbortError")); }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class BackendResilience {
  private listeners = new Set<() => void>();
  private inFlightReads = new Map<string, Promise<Response>>();
  private circuits = new Map<string, CircuitState>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly log?: ResilienceOptions["log"];
  private readonly circuitBreaker: boolean;

  constructor(options: ResilienceOptions = {}) {
    const nativeFetch = options.fetchImpl ?? globalThis.fetch;
    // Native browser fetch requires Window as its receiver. Store a bound
    // function because later invoking this.fetchImpl(...) supplies this class.
    this.fetchImpl = nativeFetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = options.log;
    this.circuitBreaker = options.circuitBreaker ?? true;
  }

  get circuitOpen() { return [...this.circuits.values()].some((circuit) => circuit.openedUntil > this.now()); }

  subscribeRecovery(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  fetch(input: RequestInfo | URL, init: ResilientRequestInit = {}): Promise<Response> {
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const url = input instanceof Request ? input.url : String(input);
    if (method !== "GET" || signal || /\/auth\/v1\//i.test(url)) return this.fetchWithPolicy(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const identity = headers.get("authorization") ?? "";
    let identityHash = 2166136261;
    for (let index = 0; index < identity.length; index++) identityHash = Math.imul(identityHash ^ identity.charCodeAt(index), 16777619);
    const key = `${url}|${identityHash >>> 0}|${headers.get("accept") ?? ""}|${init.resilienceTimeoutMs ?? this.timeoutMs}`;
    const active = this.inFlightReads.get(key);
    if (active) {
      this.log?.("backend_request_deduped", { method });
      return active.then((response) => response.clone());
    }

    const request = this.fetchWithPolicy(input, init);
    this.inFlightReads.set(key, request);
    return request.finally(() => {
      if (this.inFlightReads.get(key) === request) this.inFlightReads.delete(key);
    }).then((response) => response.clone());
  }

  private async fetchWithPolicy(input: RequestInfo | URL, init: ResilientRequestInit = {}): Promise<Response> {
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    const safeRead = method === "GET" || method === "HEAD";
    const authRequest = /\/auth\/v1\//i.test(url);
    const circuitProtected = this.circuitBreaker && safeRead && !authRequest;
    const { resilienceTimeoutMs, ...nativeInit } = init;
    const requestTimeoutMs = Number.isFinite(resilienceTimeoutMs) && Number(resilienceTimeoutMs) > 0
      ? Number(resilienceTimeoutMs)
      : safeRead ? this.timeoutMs : DEFAULT_MUTATION_TIMEOUT_MS;
    const path = safeRequestPath(url);
    const circuitKey = `${safeOrigin(url)}${path}`;
    const circuit = circuitProtected
      ? this.circuitFor(circuitKey)
      : { consecutiveFailures: 0, openedUntil: 0, probeInFlight: false };
    let probing = false;

    if (circuitProtected && circuit.openedUntil) {
      if (this.now() < circuit.openedUntil) {
        this.log?.("backend_request_blocked", { method, path, blockedBeforeRequest: true, circuitFailures: circuit.consecutiveFailures });
        return circuitOpenResponse("cooldown");
      }
      if (circuit.probeInFlight) {
        this.log?.("backend_request_blocked", { method, path, blockedBeforeRequest: true, reason: "recovery_probe_in_flight" });
        return circuitOpenResponse("probe_in_flight");
      }
      circuit.probeInFlight = true;
      probing = true;
      this.log?.("backend_probe_started", { method, path, probe: "first real request after cooldown" });
    }

    const retries = safeRead && !authRequest ? RETRY_DELAYS_MS.length : 0;
    let requestFailureRecorded = false;
    const deadline = this.now() + requestTimeoutMs;
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const remainingMs = deadline - this.now();
        if (remainingMs <= 0) throw new BackendRequestTimeoutError(requestTimeoutMs);
        let timedOut = false;
        const externalSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (externalSignal?.aborted) throw new DOMException("Request aborted", "AbortError");
        externalSignal?.addEventListener("abort", onAbort, { once: true });
        const attemptTimeoutMs = safeRead ? Math.min(MAX_ATTEMPT_TIMEOUT_MS, remainingMs) : remainingMs;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, attemptTimeoutMs);
        try {
          const attemptStartedAt = this.now();
          const response = await this.fetchImpl(input, { ...nativeInit, signal: controller.signal });
          if (response.status >= 400 || this.now() - attemptStartedAt >= 750) {
            this.log?.("backend_request_completed", { method, path, requestType: safeRead ? "read" : "mutation", attempt: attempt + 1, status: response.status, durationMs: this.now() - attemptStartedAt });
          }
          let failure = classifyBackendFailure(response);
          if (!failure.transient && response.status >= 500) {
            const body = await response.clone().text().catch(() => "");
            failure = classifyBackendFailure({ status: response.status, message: body });
          }
          if (failure.transient) {
            if (attempt < retries) {
              const delayMs = retryDelayMs(attempt, this.random);
              if (this.now() + delayMs >= deadline) throw new BackendRequestTimeoutError(requestTimeoutMs);
              this.log?.("backend_request_retry", { method, attempt: attempt + 1, maxRetries: retries, delayMs, kind: failure.kind, status: failure.status, code: failure.code });
              await this.sleep(delayMs, externalSignal ?? undefined);
              continue;
            }
          } else if (circuitProtected) {
              this.recordSuccess(circuit, probing, method, path);
            probing = false;
          }
          if (failure.transient) {
            if (circuitProtected && !requestFailureRecorded) {
              this.recordFailure(circuit, failure, method, attempt + 1, path);
              requestFailureRecorded = true;
            }
            this.log?.("backend_retry_exhausted", { method, path, attempts: attempt + 1, kind: failure.kind, status: failure.status, code: failure.code });
          }
          return response;
        } catch (error) {
          const failure = timedOut ? { transient: true, kind: "timeout" as const } : classifyBackendFailure(error);
          if (timedOut) this.log?.("backend_request_timeout", { method, path, requestType: safeRead ? "read" : "mutation", attempt: attempt + 1, timeoutMs: attemptTimeoutMs, requestSent: true });
          if (!failure.transient || externalSignal?.aborted) throw error;
          if (attempt < retries) {
            const delayMs = retryDelayMs(attempt, this.random);
            if (this.now() + delayMs >= deadline) throw new BackendRequestTimeoutError(requestTimeoutMs, error);
            this.log?.("backend_request_retry", { method, attempt: attempt + 1, maxRetries: retries, delayMs, kind: failure.kind });
            await this.sleep(delayMs, externalSignal ?? undefined);
            continue;
          }
          if (circuitProtected && !requestFailureRecorded) {
            this.recordFailure(circuit, failure, method, attempt + 1, path);
            requestFailureRecorded = true;
          }
          this.log?.("backend_retry_exhausted", { method, path, attempts: attempt + 1, kind: failure.kind });
          if (timedOut) throw new BackendRequestTimeoutError(requestTimeoutMs, error);
          throw error;
        } finally {
          if (timer) clearTimeout(timer);
          externalSignal?.removeEventListener("abort", onAbort);
        }
      }
      throw new Error("Backend resilience completed without a response or failure.");
    } finally {
      if (probing) circuit.probeInFlight = false;
    }
  }

  private circuitFor(key: string): CircuitState {
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = { consecutiveFailures: 0, openedUntil: 0, probeInFlight: false };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  private recordFailure(circuit: CircuitState, failure: BackendFailure, method: string, attempt: number, path: string) {
    circuit.consecutiveFailures++;
    this.log?.("backend_transient_failure", { method, path, attempt, kind: failure.kind, status: failure.status, code: failure.code, circuitFailures: circuit.consecutiveFailures, requestSent: true });
    if (circuit.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuit.openedUntil <= this.now()) {
      circuit.openedUntil = this.now() + CIRCUIT_COOLDOWN_MS;
      this.log?.("backend_circuit_opened", { path, cooldownMs: CIRCUIT_COOLDOWN_MS, consecutiveFailures: circuit.consecutiveFailures });
    }
  }

  private recordSuccess(circuit: CircuitState, probing: boolean, method: string, path: string) {
    const wasOpen = Boolean(circuit.openedUntil);
    circuit.consecutiveFailures = 0;
    circuit.openedUntil = 0;
    circuit.probeInFlight = false;
    if (wasOpen || probing) {
      this.log?.("backend_recovered", { method, path });
      for (const listener of this.listeners) listener();
    }
  }
}

function safeOrigin(value: string) {
  try { return new URL(value, "https://tttracker.invalid").origin; }
  catch { return "unknown-origin"; }
}

function circuitOpenResponse(reason: "cooldown" | "probe_in_flight") {
  return new Response(JSON.stringify({ error: "Request temporarily deferred while the connection recovers." }), {
    status: 503,
    statusText: "Service Unavailable",
    headers: {
      "content-type": "application/json",
      "retry-after": "2",
      "x-tttracker-transient-failure": "circuit-open",
      "x-tttracker-circuit-state": reason,
    },
  });
}

function developmentLog(event: string, fields: Record<string, unknown>) {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") console.info("TTTracker backend resilience", { event, ...fields });
}

export const backendResilience = new BackendResilience({ log: developmentLog });
export const resilientFetch: typeof fetch = (input, init) => backendResilience.fetch(input, init);
export function createRequestResilientFetch(options: ResilienceOptions = {}): typeof fetch {
  const requestResilience = new BackendResilience({ ...options, log: options.log ?? developmentLog });
  return (input, init) => requestResilience.fetch(input, init);
}
export const isTransientBackendFailure = (error: unknown) => classifyBackendFailure(error).transient;
export const subscribeBackendRecovery = (listener: () => void) => backendResilience.subscribeRecovery(listener);
