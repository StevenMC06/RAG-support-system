import { randomUUID } from "node:crypto";

export type TraceContext = { requestId: string; callId: string };
type Operation =
  | { kind: "request"; name: string }
  | { kind: "internal"; name: string }
  | { kind: "model"; name: string; provider: string; model: string }
  | { kind: "tool"; name: string; toolName: string };
type ProviderMetadata = { providerRequestId?: string; providerResponseId?: string };

export type TimingEvent = Operation & ProviderMetadata & {
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
  let details: ProviderMetadata & { httpStatus?: number } = {};
  try {
    const result = await run(context);
    outcome = "success";
    // A telemetry metadata failure must not change the operation result.
    try { details = metadata?.(result) ?? {}; } catch { /* best effort */ }
    if (details.httpStatus !== undefined && details.httpStatus >= 400) outcome = "failure";
    return result;
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
