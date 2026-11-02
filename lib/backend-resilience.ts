export type BackendFailureKind = "http" | "postgrest" | "network" | "timeout";
export type BackendFailure = { transient: boolean; kind?: BackendFailureKind; status?: number; code?: string };

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000] as const;
const CIRCUIT_FAILURE_THRESHOLD = 8;
const CIRCUIT_COOLDOWN_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPT_TIMEOUT_MS = 10_000;

function errorFields(value: unknown): { status?: number; code?: string; message: string } {
  if (value instanceof Response) return { status: value.status, message: "" };
  if (!value || typeof value !== "object") return { message: String(value ?? "") };
  const row = value as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; cause?: unknown };
  const status = Number(row.status ?? row.statusCode);
  const code = typeof row.code === "string" ? row.code : undefined;
  const message = [row.message, row.cause instanceof Error ? row.cause.message : ""].filter(Boolean).join(" ");
  return { ...(Number.isFinite(status) && status > 0 ? { status } : {}), ...(code ? { code } : {}), message };
}

export function classifyBackendFailure(value: unknown): BackendFailure {
  const fields = errorFields(value);
  const combined = `${fields.code ?? ""} ${fields.message}`.toLowerCase();
  if (fields.code === "TT_BACKEND_UNAVAILABLE") return { transient: true, kind: "network", ...(fields.status ? { status: fields.status } : {}) };
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

export class BackendUnavailableError extends Error {
  readonly code = "TT_BACKEND_UNAVAILABLE";
  constructor(message = "TTTracker is temporarily unable to reach its data service. Showing saved data where available.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

type ResilienceOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  timeoutMs?: number;
  log?: (event: string, fields: Record<string, unknown>) => void;
};

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
  private failures = 0;
  private openedUntil = 0;
  private probeInFlight = false;
  private listeners = new Set<() => void>();
  private inFlightReads = new Map<string, Promise<Response>>();
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly log?: ResilienceOptions["log"];

  constructor(options: ResilienceOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? defaultSleep;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = options.log;
  }

  get circuitOpen() { return this.openedUntil > this.now(); }

  subscribeRecovery(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const url = input instanceof Request ? input.url : String(input);
    if (method !== "GET" || signal || /\/auth\/v1\//i.test(url)) return this.fetchWithPolicy(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const identity = headers.get("authorization") ?? "";
    let identityHash = 2166136261;
    for (let index = 0; index < identity.length; index++) identityHash = Math.imul(identityHash ^ identity.charCodeAt(index), 16777619);
    const key = `${url}|${identityHash >>> 0}|${headers.get("accept") ?? ""}`;
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

  private async fetchWithPolicy(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const method = String(init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    const safeRead = method === "GET" || method === "HEAD";
    const authRequest = /\/auth\/v1\//i.test(url);
    const circuitProtected = !authRequest;
    let probing = false;

    if (circuitProtected && this.openedUntil) {
      if (this.now() < this.openedUntil) throw new BackendUnavailableError();
      if (this.probeInFlight) throw new BackendUnavailableError("TTTracker is checking its connection. Retry shortly.");
      this.probeInFlight = true;
      probing = true;
      this.log?.("backend_probe_started", { method });
    }

    const retries = safeRead && !authRequest ? RETRY_DELAYS_MS.length : 0;
    let lastTransient: BackendFailure | null = null;
    const deadline = this.now() + this.timeoutMs;
    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const remainingMs = deadline - this.now();
        if (remainingMs <= 0) throw new BackendUnavailableError(`TTTracker request timed out after ${Math.ceil(this.timeoutMs / 1000)} seconds.`);
        let timedOut = false;
        const externalSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        if (externalSignal?.aborted) throw new DOMException("Request aborted", "AbortError");
        externalSignal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.min(MAX_ATTEMPT_TIMEOUT_MS, remainingMs));
        try {
          const response = await this.fetchImpl(input, { ...init, signal: controller.signal });
          let failure = classifyBackendFailure(response);
          if (!failure.transient && response.status >= 500) {
            const body = await response.clone().text().catch(() => "");
            failure = classifyBackendFailure({ status: response.status, message: body });
          }
          if (failure.transient) {
            lastTransient = failure;
            if (circuitProtected) this.recordFailure(failure, method, attempt + 1);
            if (attempt < retries) {
              const delayMs = retryDelayMs(attempt, this.random);
              if (this.now() + delayMs >= deadline) throw new BackendUnavailableError(`TTTracker request timed out after ${Math.ceil(this.timeoutMs / 1000)} seconds.`);
              this.log?.("backend_request_retry", { method, attempt: attempt + 1, maxRetries: retries, delayMs, kind: failure.kind, status: failure.status, code: failure.code });
              await this.sleep(delayMs, externalSignal ?? undefined);
              continue;
            }
          } else if (circuitProtected) {
            this.recordSuccess(probing, method);
            probing = false;
          }
          if (failure.transient) this.log?.("backend_retry_exhausted", { method, attempts: attempt + 1, kind: failure.kind, status: failure.status, code: failure.code });
          return response;
        } catch (error) {
          const failure = timedOut ? { transient: true, kind: "timeout" as const } : classifyBackendFailure(error);
          if (!failure.transient || externalSignal?.aborted) throw error;
          lastTransient = failure;
          if (circuitProtected) this.recordFailure(failure, method, attempt + 1);
          if (attempt < retries) {
            const delayMs = retryDelayMs(attempt, this.random);
            if (this.now() + delayMs >= deadline) throw new BackendUnavailableError(`TTTracker request timed out after ${Math.ceil(this.timeoutMs / 1000)} seconds.`);
            this.log?.("backend_request_retry", { method, attempt: attempt + 1, maxRetries: retries, delayMs, kind: failure.kind });
            await this.sleep(delayMs, externalSignal ?? undefined);
            continue;
          }
          this.log?.("backend_retry_exhausted", { method, attempts: attempt + 1, kind: failure.kind });
          if (timedOut) throw new BackendUnavailableError(`TTTracker request timed out after ${Math.ceil(this.timeoutMs / 1000)} seconds.`);
          throw new BackendUnavailableError();
        } finally {
          if (timer) clearTimeout(timer);
          externalSignal?.removeEventListener("abort", onAbort);
        }
      }
      if (lastTransient) throw new BackendUnavailableError();
      throw new BackendUnavailableError();
    } finally {
      if (probing) this.probeInFlight = false;
    }
  }

  private recordFailure(failure: BackendFailure, method: string, attempt: number) {
    this.failures++;
    this.log?.("backend_transient_failure", { method, attempt, kind: failure.kind, status: failure.status, code: failure.code });
    if (this.failures >= CIRCUIT_FAILURE_THRESHOLD && !this.circuitOpen) {
      this.openedUntil = this.now() + CIRCUIT_COOLDOWN_MS;
      this.log?.("backend_circuit_opened", { cooldownMs: CIRCUIT_COOLDOWN_MS, failures: this.failures });
    }
  }

  private recordSuccess(probing: boolean, method: string) {
    const wasOpen = Boolean(this.openedUntil);
    this.failures = 0;
    this.openedUntil = 0;
    if (this.probeInFlight) this.probeInFlight = false;
    if (wasOpen || probing) {
      this.log?.("backend_recovered", { method });
      for (const listener of this.listeners) listener();
    }
  }
}

function developmentLog(event: string, fields: Record<string, unknown>) {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") console.info("TTTracker backend resilience", { event, ...fields });
}

export const backendResilience = new BackendResilience({ log: developmentLog });
export const resilientFetch: typeof fetch = (input, init) => backendResilience.fetch(input, init);
export const isTransientBackendFailure = (error: unknown) => classifyBackendFailure(error).transient;
export const subscribeBackendRecovery = (listener: () => void) => backendResilience.subscribeRecovery(listener);
