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
});
