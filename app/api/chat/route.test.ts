import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { completionCreate, retrieveChunks, construct } = vi.hoisted(() => ({
  completionCreate: vi.fn(),
  construct: vi.fn(),
  retrieveChunks: vi.fn(),
}));

vi.mock("@/lib/retrieval", () => ({ retrieveChunks }));
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() { construct(); }
    chat = { completions: { create: completionCreate } };
  },
}));

import { POST } from "./route";
import { consumeChatStream } from "@/lib/chat-stream-client";
import type { ChatStreamEvent } from "@/lib/chat-events";

describe("POST /api/chat", () => {
  it("imports without credentials and handles generation initialization failures", async () => {
    vi.resetModules();
    construct.mockImplementation(() => { throw new Error("Missing credentials"); });
    const { POST: imported } = await import("./route");
    expect(construct).not.toHaveBeenCalled();
    retrieveChunks.mockResolvedValue([
      { id: 1, documentId: 4, chunkIndex: 3, content: "Context", distance: 0.04 },
    ]);
    const response = await imported(new Request("http://localhost/api/chat", {
      method: "POST", body: JSON.stringify({ question: "Question" }),
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ success: false, message: "Chat failed" });
    expect(completionCreate).not.toHaveBeenCalled();
  });

  beforeEach(() => vi.resetAllMocks());

  it("rejects a malformed question before calling dependencies", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: 1 }),
      })
    );

    expect(response.status).toBe(400);
    expect(retrieveChunks).not.toHaveBeenCalled();
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it("returns the fallback answer without calling OpenAI when no chunks match", async () => {
    retrieveChunks.mockResolvedValue([]);

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "Where is the handbook?" }),
      })
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      answer: "No relevant document content is available.",
      citations: [],
    });
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it("uses retrieved excerpts and returns citations", async () => {
    retrieveChunks.mockResolvedValue([
      { id: 1, documentId: 4, chunkIndex: 3, content: "Vacation is 15 days.", distance: 0.04 },
    ]);
    completionCreate.mockResolvedValue({
      choices: [{ message: { content: "Employees receive 15 days [Source 4:3]." } }],
    });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ question: "  How much vacation? " }),
      })
    );

    expect(retrieveChunks).toHaveBeenCalledWith("How much vacation?", 5, expect.objectContaining({ requestId: expect.any(String), callId: expect.any(String) }));
    expect(completionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4.1-mini",
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("Vacation is 15 days.") }),
        ]),
      })
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      question: "How much vacation?",
      answer: "Employees receive 15 days [Source 4:3].",
      citations: [{ documentId: 4, chunkIndex: 3, distance: 0.04 }],
    });
  });
});


const matchedChunks = [{ id: 1, documentId: 4, chunkIndex: 3, content: "Private context", distance: 0.04 }];
const textChunk = (text: string) => ({ id: "chatcmpl-test", choices: [{ delta: { content: text }, finish_reason: null }] });
const stopChunk = { id: "chatcmpl-test", choices: [{ delta: {}, finish_reason: "stop" }] };

function streamRequest(signal?: AbortSignal, accept = "text/event-stream") {
  return new Request("http://localhost/api/chat", {
    method: "POST", headers: { Accept: accept }, body: JSON.stringify({ question: "Question" }), signal,
  });
}

function mockStream(iterable: AsyncIterable<unknown>) {
  const controller = new AbortController();
  completionCreate.mockReturnValue({ withResponse: () => Promise.resolve({
    data: { [Symbol.asyncIterator]: () => iterable[Symbol.asyncIterator](), controller }, request_id: "req_stream",
  }) });
  return controller;
}

function events(text: string) {
  return text.split("\n\n").filter(Boolean).map(frame => JSON.parse(frame.split("\ndata: ")[1]));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("POST /api/chat streaming", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("requires positive explicit SSE acceptance and preserves JSON", async () => {
    retrieveChunks.mockResolvedValue([]);
    for (const accept of ["application/json", "*/*", "text/event-stream;q=0", "text/event-stream;q=nope"]) {
      const response = await POST(streamRequest(undefined, accept));
      expect(response.headers.get("content-type")).toContain("application/json");
      expect((await response.json()).answer).toContain("No relevant document");
    }
  });

  it("validates before streaming and returns JSON errors with request IDs", async () => {
    const response = await POST(new Request("http://localhost/api/chat", {
      method: "POST", headers: { Accept: "text/event-stream" }, body: JSON.stringify({ question: " " }),
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
    expect(retrieveChunks).not.toHaveBeenCalled();
    retrieveChunks.mockRejectedValue(new Error("private database error"));
    const failed = await POST(streamRequest());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ success: false, message: "Chat failed" });
  });

  it("streams fallback sources/text/completion without a model call", async () => {
    retrieveChunks.mockResolvedValue([]);
    const response = await POST(streamRequest());
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
    expect(events(await response.text())).toEqual([
      { type: "sources", citations: [] },
      { type: "delta", text: "No relevant document content is available." },
      { type: "done" },
    ]);
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it("delivers text before completion and times the full stream with token usage", async () => {
    const logs: Record<string, unknown>[] = [];
    vi.spyOn(console, "info").mockImplementation(line => logs.push(JSON.parse(line)));
    const gate = deferred<void>();
    retrieveChunks.mockResolvedValue(matchedChunks);
    mockStream((async function* () {
      yield textChunk("First ");
      await gate.promise;
      yield textChunk("second [Source 4:3].");
      yield stopChunk;
      yield { id: "chatcmpl-test", choices: [], usage: { prompt_tokens: 120, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 40 } } };
    })());
    const response = await POST(streamRequest());
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(events(decoder.decode((await reader.read()).value))[0].type).toBe("sources");
    expect(events(decoder.decode((await reader.read()).value))).toEqual([{ type: "delta", text: "First " }]);
    expect(logs.filter(event => event.kind === "request")).toHaveLength(0);
    gate.resolve();
    let tail = "";
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      tail += decoder.decode(next.value);
    }
    expect(events(tail).map(event => event.type)).toEqual(["delta", "done"]);
    const generation = logs.find(event => event.kind === "model")!;
    const request = logs.find(event => event.kind === "request")!;
    expect(generation).toMatchObject({ outcome: "success", providerRequestId: "req_stream", providerResponseId: "chatcmpl-test", inputTokens: 120, outputTokens: 12, cachedInputTokens: 40 });
    expect(generation.firstTextMs).toEqual(expect.any(Number));
    expect(generation.parentId).toBe(request.callId);
    expect(generation.requestId).toBe(response.headers.get("X-Request-ID"));
    expect(completionCreate).toHaveBeenCalledWith(expect.objectContaining({ stream: true, stream_options: { include_usage: true } }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(JSON.stringify(logs)).not.toContain("Private context");
  });

  it("returns a normal HTTP error when model startup fails", async () => {
    retrieveChunks.mockResolvedValue(matchedChunks);
    completionCreate.mockReturnValue({ withResponse: () => Promise.reject(new Error("private provider detail")) });
    const response = await POST(streamRequest());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, message: "Chat failed" });
  });

  it.each(["throw", "length", "content_filter", "missing-stop", "empty"])("does not mark interrupted model output complete: %s", async mode => {
    retrieveChunks.mockResolvedValue(matchedChunks);
    mockStream((async function* () {
      if (mode !== "empty") yield textChunk("Partial");
      if (mode === "throw") throw new Error("private provider detail");
      if (mode === "length" || mode === "content_filter") yield { choices: [{ delta: {}, finish_reason: mode }] };
      if (mode === "empty") yield stopChunk;
    })());
    const response = await POST(streamRequest());
    const output = events(await response.text());
    expect(output.at(-1)).toEqual({ type: "error", message: "Answer interrupted. Please try again." });
    expect(output.some(event => event.type === "done")).toBe(false);
    expect(JSON.stringify(output)).not.toContain("private provider detail");
  });

  it("does not start retrieval for an already cancelled request", async () => {
    const abort = new AbortController(); abort.abort();
    const response = await POST(streamRequest(abort.signal));
    expect(response.status).toBe(499);
    expect(retrieveChunks).not.toHaveBeenCalled();
  });

  it("does not start billable generation when cancelled during retrieval", async () => {
    const gate = deferred<typeof matchedChunks>();
    retrieveChunks.mockReturnValue(gate.promise);
    const abort = new AbortController();
    const responsePromise = POST(streamRequest(abort.signal));
    // Let request.json resolve and retrieval begin.
    await vi.waitFor(() => expect(retrieveChunks).toHaveBeenCalled());
    abort.abort(); gate.resolve(matchedChunks);
    expect((await responsePromise).status).toBe(499);
    expect(completionCreate).not.toHaveBeenCalled();
  });

  it.each(["reader", "request"])("aborts upstream and finishes once on %s cancellation", async mode => {
    const logs: Record<string, unknown>[] = [];
    vi.spyOn(console, "info").mockImplementation(line => logs.push(JSON.parse(line)));
    const gate = deferred<void>();
    retrieveChunks.mockResolvedValue(matchedChunks);
    const upstream = mockStream((async function* () { yield textChunk("Partial"); await gate.promise; yield stopChunk; })());
    const abort = new AbortController();
    const response = await POST(streamRequest(abort.signal));
    const reader = response.body!.getReader();
    await reader.read(); await reader.read();
    if (mode === "reader") await reader.cancel(); else abort.abort();
    expect(upstream.signal.aborted).toBe(true);
    expect(completionCreate.mock.calls[0][1].signal.aborted).toBe(true);
    gate.resolve();
    await Promise.resolve();
    const finished = logs.filter(event => event.kind === "model" || event.kind === "request");
    expect(finished).toHaveLength(2);
    expect(finished.every(event => event.outcome === "cancelled")).toBe(true);
    expect((await reader.read()).done).toBe(true);
  });
});


describe("route and browser stream contract integration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("consumes the actual route body incrementally using the browser parser", async () => {
    const gate = deferred<void>();
    retrieveChunks.mockResolvedValue(matchedChunks);
    mockStream((async function* () {
      yield textChunk("Rank café ");
      await gate.promise;
      yield textChunk("[Source 4:3].");
      yield stopChunk;
    })());
    const response = await POST(streamRequest());
    const observed: ChatStreamEvent[] = [];
    const consuming = consumeChatStream(response.body!, event => observed.push(event));
    await vi.waitFor(() => expect(observed.some(event => event.type === "delta")).toBe(true));
    expect(observed.some(event => event.type === "done")).toBe(false);
    gate.resolve();
    await consuming;
    expect(observed.map(event => event.type)).toEqual(["sources", "delta", "delta", "done"]);
  });

  it("rejects actual midstream errors and retains already delivered text", async () => {
    retrieveChunks.mockResolvedValue(matchedChunks);
    mockStream((async function* () { yield textChunk("Partial answer"); throw new Error("private error"); })());
    const response = await POST(streamRequest());
    const observed: ChatStreamEvent[] = [];
    await expect(consumeChatStream(response.body!, event => observed.push(event))).rejects.toThrow("interrupted");
    expect(observed.map(event => event.type)).toEqual(["sources", "delta", "error"]);
    expect(JSON.stringify(observed)).not.toContain("private error");
  });
});
