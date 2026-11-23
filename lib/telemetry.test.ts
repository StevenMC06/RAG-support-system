import { afterEach, describe, expect, it, vi } from "vitest";
import { timeOperation, timeRequest, type TimingEvent } from "./telemetry";

afterEach(() => vi.restoreAllMocks());

function capture() {
  const events: TimingEvent[] = [];
  vi.spyOn(console, "info").mockImplementation((line) => events.push(JSON.parse(line)));
  return events;
}

describe("request and call timing", () => {
  it("links nested calls, keeps concurrent requests separate, and measures elapsed time", async () => {
    const events = capture();
    let now = 10;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const response = await timeRequest("POST /api/chat", async (trace) => {
      await timeOperation(trace, { kind: "tool", name: "lookup", toolName: "search" }, async () => { now = 35; });
      return Response.json({ success: true });
    });
    const [tool, request] = events;
    expect(tool.durationMs).toBe(25);
    expect(tool.parentId).toBe(request.callId);
    expect(tool.requestId).toBe(request.requestId);
    expect(tool.callId).not.toBe(request.callId);
    expect(response.headers.get("X-Request-ID")).toBe(request.requestId);
    expect(new Date(tool.startedAt).toISOString()).toBe(tool.startedAt);
    expect(new Date(tool.endedAt).toISOString()).toBe(tool.endedAt);
    await Promise.all([1, 2].map(() => timeRequest("search", async () => Response.json({}))));
    expect(new Set(events.filter(e => e.kind === "request").map(e => e.requestId)).size).toBe(3);
  });

  it("records failed duration and rethrows the original error without exporting it", async () => {
    const events = capture();
    const error = new Error("secret document");
    vi.spyOn(performance, "now").mockReturnValueOnce(1).mockReturnValueOnce(8);
    await expect(timeOperation(undefined, { kind: "model", name: "generate", provider: "local", model: "test" }, async () => { throw error; })).rejects.toBe(error);
    expect(events[0]).toMatchObject({ outcome: "failure", durationMs: 7, model: "test", provider: "local" });
    expect(JSON.stringify(events)).not.toContain("secret document");
  });

  it("records provider identifiers, but excludes payloads", async () => {
    const events = capture();
    await timeOperation(undefined, { kind: "model", name: "generate", provider: "openai", model: "test" }, async () => ({ id: "response", _request_id: "provider-request", content: "private answer" }), result => ({ providerResponseId: result.id, providerRequestId: result._request_id }));
    expect(events[0]).toMatchObject({ providerResponseId: "response", providerRequestId: "provider-request" });
    expect(JSON.stringify(events)).not.toContain("private answer");
  });

  it("marks HTTP errors as failures and includes request IDs", async () => {
    const events = capture();
    const response = await timeRequest("search", async () => Response.json({}, { status: 400 }));
    expect(events[0]).toMatchObject({ outcome: "failure", httpStatus: 400 });
    expect(response.headers.get("X-Request-ID")).toBe(events[0].requestId);
  });

  it("preserves results and exceptions if the logger fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger down"); });
    await expect(timeOperation(undefined, { kind: "internal", name: "lookup" }, async () => 42)).resolves.toBe(42);
    const error = new Error("original");
    await expect(timeOperation(undefined, { kind: "internal", name: "lookup" }, async () => { throw error; })).rejects.toBe(error);
  });

  it("classifies wrapped Prisma connection errors without exporting host or message", async () => {
    const events = capture();
    const error = Object.assign(new Error("postgres://private:password@host"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { kind: "DatabaseNotReachable", host: "private-host" } } },
    });
    await expect(timeOperation(undefined, { kind: "internal", name: "retrieval.database" }, async () => { throw error; })).rejects.toBe(error);
    expect(events[0]).toMatchObject({ errorCategory: "database_connection", errorCode: "P2010" });
    expect(JSON.stringify(events)).not.toMatch(/password|private-host|postgres:/);
  });

  it("retains the underlying SQLSTATE for failed raw queries", async () => {
    const events = capture();
    const error = { code: "P2010", meta: { code: "42P01", message: "private table" } };
    await expect(timeOperation(undefined, { kind: "internal", name: "retrieval.database" }, async () => { throw error; })).rejects.toBe(error);
    expect(events[0]).toMatchObject({ errorCategory: "database_query", errorCode: "42P01" });
    expect(JSON.stringify(events)).not.toContain("private table");
  });

  it("retains safe provider failure diagnostics", async () => {
    const events = capture();
    const error = { status: 429, code: "rate_limit_exceeded", requestID: "req_provider-123", message: "private input", error: { message: "private body" } };
    await expect(timeOperation(undefined, { kind: "model", name: "generate", provider: "openai", model: "test" }, async () => { throw error; })).rejects.toBe(error);
    expect(events[0]).toMatchObject({ errorCategory: "provider_rate_limit", errorCode: "rate_limit_exceeded", providerStatus: 429, providerRequestId: "req_provider-123" });
    expect(JSON.stringify(events)).not.toMatch(/private input|private body/);
  });

  it("classifies SDK timeouts and network failures from known diagnostic fields", async () => {
    const events = capture();
    for (const error of [{ name: "APIConnectionTimeoutError" }, { cause: { code: "ECONNREFUSED" } }]) {
      await expect(timeOperation(undefined, { kind: "model", name: "generate", provider: "openai", model: "test" }, async () => { throw error; })).rejects.toBe(error);
    }
    expect(events[0].errorCategory).toBe("timeout");
    expect(events[1]).toMatchObject({ errorCategory: "network", errorCode: "ECONNREFUSED" });
  });

  it("rejects arbitrary diagnostic strings and preserves exceptions with unsafe getters", async () => {
    const events = capture();
    const secret = { code: "private text", name: "private name", requestID: "private id", status: 123456 };
    await expect(timeOperation(undefined, { kind: "model", name: "generate", provider: "local", model: "test" }, async () => { throw secret; })).rejects.toBe(secret);
    expect(events[0]).toMatchObject({ errorCategory: "unknown" });
    expect(JSON.stringify(events)).not.toMatch(/private text|private name|private id/);
    const hostile = Object.defineProperty({}, "code", { get() { throw new Error("getter"); } });
    await expect(timeOperation(undefined, { kind: "tool", name: "lookup", toolName: "search" }, async () => { throw hostile; })).rejects.toBe(hostile);
    expect(events[1].errorCategory).toBe("unknown");
  });

});
