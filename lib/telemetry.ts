import { randomUUID } from "node:crypto";

export type TraceContext = Readonly<{ requestId: string; callId: string }>;
export type Operation =
  | { kind: "request"; name: string }
  | { kind: "internal"; name: string }
  | { kind: "model"; name: string; provider: string; model: string }
  | { kind: "tool"; name: string; toolName: string };
type ProviderMetadata = { providerRequestId?: string; providerResponseId?: string };

type FailureMetadata = {
  errorCategory?: "database_connection" | "database_query" | "network" | "timeout" |
    "provider_authentication" | "provider_rate_limit" | "provider_error" | "unknown";
  errorCode?: string;
  providerStatus?: number;
};

const safeErrorCodes = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH",
  "P1000", "P1001", "P1002", "P1010", "P1017", "P2010", "P2021", "P2022", "P2024",
  "08000", "08001", "08003", "08006", "28P01", "3D000", "42P01", "42703", "42883", "57014",
  "invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "model_not_found",
]);
const connectionCodes = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH",
  "P1000", "P1001", "P1002", "P1010", "P1017", "P2024",
  "08000", "08001", "08003", "08006", "28P01", "3D000",
]);
const connectionKinds = new Set([
  "DatabaseNotReachable", "ConnectionClosed", "SocketTimeout", "TlsConnectionError",
]);

// Inspect only known diagnostic fields. Never read or serialize message, stack,
// query, connection strings, raw provider bodies, or arbitrary error properties.
function failureMetadata(error: unknown, operation: Operation): FailureMetadata & ProviderMetadata {
  const fallback: FailureMetadata = { errorCategory: "unknown" };
  try {
    const database = operation.kind === "internal" && operation.name === "retrieval.database";
    const pending: unknown[] = [error];
    const seen = new Set<object>();
    let errorCode: string | undefined;
    let connection = false;
    let timeout = false;
    let providerStatus: number | undefined;
    let providerRequestId: string | undefined;
    // Prisma may wrap the driver's error under meta.driverAdapterError.cause.
    for (let i = 0; i < pending.length && i < 12; i++) {
      const candidate = pending[i];
      if (!candidate || typeof candidate !== "object" || seen.has(candidate)) continue;
      seen.add(candidate);
      const item = candidate as Record<string, unknown>;
      for (const code of [item.code, item.originalCode]) {
        if (typeof code === "string" && safeErrorCodes.has(code)) {
          errorCode = code;
          connection ||= connectionCodes.has(code);
          timeout ||= code === "ETIMEDOUT";
        }
      }
      connection ||= typeof item.kind === "string" && connectionKinds.has(item.kind);
      timeout ||= item.name === "APIConnectionTimeoutError" || item.kind === "SocketTimeout";
      if (operation.kind === "model") {
        const status = item.status;
        if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
          providerStatus ??= status;
        }
        const requestID = item.requestID ?? item.request_id ?? item._request_id;
        if (typeof requestID === "string" && /^req_[A-Za-z0-9_-]{1,100}$/.test(requestID)) {
          providerRequestId ??= requestID;
        }
      }
      pending.push(item.cause, item.meta, item.driverAdapterError);
    }
    const errorCategory: FailureMetadata["errorCategory"] = database
      ? connection ? "database_connection" : "database_query"
      : timeout ? "timeout"
      : operation.kind === "model" && providerStatus !== undefined
        ? providerStatus === 401 || providerStatus === 403 ? "provider_authentication"
          : providerStatus === 429 ? "provider_rate_limit" : "provider_error"
        : connection ? "network" : "unknown";
    return { errorCategory, errorCode, providerStatus, providerRequestId };
  } catch {
    return fallback;
  }
}

export type OperationMetadata = ProviderMetadata & {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  httpStatus?: number;
};

export type OperationOutcome = "success" | "failure" | "cancelled";

export type TimingEvent = Operation & OperationMetadata & FailureMetadata & {
  event: "operation.completed";
  requestId: string;
  callId: string;
  parentId?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  firstTextMs?: number;
  outcome: OperationOutcome;
};

function validTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// Explicit lifetime for streaming operations. Constructing a Response does not
// complete its body, so its caller finishes this span after consumption ends.
export function startOperation(parent: TraceContext | undefined, operation: Operation) {
  const context: TraceContext = Object.freeze({
    requestId: parent?.requestId ?? randomUUID(),
    callId: randomUUID(),
  });
  const parentId = parent?.callId;
  const descriptor = { ...operation };
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let finished = false;
  let firstTextMs: number | undefined;
  const details: OperationMetadata = {};

  function update(metadata: OperationMetadata) {
    if (finished) return;
    try {
      for (const key of ["providerRequestId", "providerResponseId"] as const) {
        const value = metadata[key];
        if (typeof value === "string" && value.length > 0 && value.length <= 256) details[key] = value;
      }
      for (const key of ["inputTokens", "outputTokens", "cachedInputTokens"] as const) {
        const value = metadata[key];
        if (validTokenCount(value)) details[key] = value;
      }
      const status = metadata.httpStatus;
      if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) {
        details.httpStatus = status;
      }
    } catch { /* Best effort metadata must never affect the application. */ }
  }

  function markFirstText() {
    if (!finished && firstTextMs === undefined) firstTextMs = performance.now() - start;
  }

  function finish(outcome: OperationOutcome, options?: { httpStatus?: number; error?: unknown }) {
    if (finished) return;
    if (options?.httpStatus !== undefined) update({ httpStatus: options.httpStatus });
    finished = true;
    try {
      const diagnostics = outcome === "failure" && options?.error !== undefined
        ? failureMetadata(options.error, descriptor) : {};
      const event: TimingEvent = {
        ...descriptor,
        event: "operation.completed",
        ...context,
        parentId,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: performance.now() - start,
        firstTextMs,
        outcome,
        ...details,
        ...diagnostics,
      };
      console.info(JSON.stringify(event));
    } catch { /* Logging must never break requests. */ }
  }

  return Object.freeze({ context, markFirstText, update, finish });
}

// Only allowlisted metadata is exported; never serialize inputs or errors.
export async function timeOperation<T>(
  parent: TraceContext | undefined,
  operation: Operation,
  run: (context: TraceContext) => Promise<T>,
  metadata?: (result: T) => OperationMetadata,
): Promise<T> {
  const span = startOperation(parent, operation);
  try {
    const result = await run(span.context);
    let details: OperationMetadata = {};
    try { details = metadata?.(result) ?? {}; } catch { /* best effort */ }
    span.update(details);
    span.finish(details.httpStatus !== undefined && details.httpStatus >= 400 ? "failure" : "success");
    return result;
  } catch (error) {
    span.finish("failure", { error });
    throw error;
  }
}

export function timeRequest(name: string, run: (context: TraceContext) => Promise<Response>) {
  return timeOperation(undefined, { kind: "request", name }, async (context) => {
    const response = await run(context);
    response.headers.set("X-Request-ID", context.requestId);
    return response;
  }, (response) => ({ httpStatus: response.status }));
}
