import { afterEach, describe, expect, it, vi } from "vitest";
const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("openai", () => ({ default: class { constructor() { construct(); } embeddings = { create }; } }));
import { createEmbeddings } from "./embeddings";

afterEach(() => { vi.restoreAllMocks(); create.mockReset(); construct.mockReset(); });

describe("embedding call telemetry", () => {
  it("imports without credentials and reports missing credentials only when called", async () => {
    vi.resetModules();
    construct.mockImplementation(() => { throw new Error("Missing credentials"); });
    const { createEmbeddings: imported } = await import("./embeddings");
    expect(construct).not.toHaveBeenCalled();
    await expect(imported([])).resolves.toEqual([]);
    await expect(imported(["text"])).rejects.toThrow("Missing credentials");
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates context and provider request ID without logging input", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    create.mockResolvedValue({ data: [{ embedding: [1, 2] }], _request_id: "provider-id" });
    await expect(createEmbeddings(["private text"], { requestId: "request", callId: "parent" })).resolves.toEqual([[1, 2]]);
    const event = JSON.parse(log.mock.calls[0][0]);
    expect(event).toMatchObject({ requestId: "request", parentId: "parent", providerRequestId: "provider-id", model: "text-embedding-3-small", outcome: "success" });
    expect(log.mock.calls[0][0]).not.toContain("private text");
  });

  it("does not invent a model call for empty input", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(createEmbeddings([])).resolves.toEqual([]);
    expect(create).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
