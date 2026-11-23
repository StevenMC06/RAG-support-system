import { randomUUID } from "node:crypto";

export type TraceContext = { requestId: string; callId: string };
type Operation =
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

export type TimingEvent = Operation & ProviderMetadata & FailureMetadata & {
  event: "operation.completed";
  requestId: string;
  callId: string;
  parentId?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outcome: "success" | "failure";
  httpStatus?: number;
};

// Only allowlisted metadata is exported; never serialize inputs or errors.
export async function timeOperation<T>(
  parent: TraceContext | undefined,
  operation: Operation,
  run: (context: TraceContext) => Promise<T>,
  metadata?: (result: T) => ProviderMetadata & { httpStatus?: number },
): Promise<T> {
  const context = { requestId: parent?.requestId ?? randomUUID(), callId: randomUUID() };
  const startedAt = new Date().toISOString();
  const start = performance.now();
  let outcome: TimingEvent["outcome"] = "failure";
  let details: ProviderMetadata & FailureMetadata & { httpStatus?: number } = {};
  try {
    const result = await run(context);
    outcome = "success";
    // A telemetry metadata failure must not change the operation result.
    try { details = metadata?.(result) ?? {}; } catch { /* best effort */ }
    if (details.httpStatus !== undefined && details.httpStatus >= 400) outcome = "failure";
    return result;
  } catch (error) {
    details = failureMetadata(error, operation);
    throw error;
  } finally {
    try {
      const event: TimingEvent = {
        ...operation,
        event: "operation.completed",
        ...context,
        parentId: parent?.callId,
        startedAt,
        endedAt: new Date().toISOString(),
        durationMs: performance.now() - start,
        outcome,
        providerRequestId: details.providerRequestId,
        providerResponseId: details.providerResponseId,
        httpStatus: details.httpStatus,
        errorCategory: details.errorCategory,
        errorCode: details.errorCode,
        providerStatus: details.providerStatus,
      };
      console.info(JSON.stringify(event));
    } catch { /* Logging must never break requests. */ }
  }
}

export function timeRequest(name: string, run: (context: TraceContext) => Promise<Response>) {
  return timeOperation(undefined, { kind: "request", name }, async (context) => {
    const response = await run(context);
    response.headers.set("X-Request-ID", context.requestId);
    return response;
  }, (response) => ({ httpStatus: response.status }));
}
