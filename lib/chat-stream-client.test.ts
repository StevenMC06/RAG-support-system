import { describe, expect, it, vi } from "vitest";
import { consumeChatStream } from "./chat-stream-client";
import { encodeChatEvent, type ChatStreamEvent } from "./chat-events";

const encoder = new TextEncoder();
function body(parts: Uint8Array[], cancel = vi.fn()) {
  return new ReadableStream<Uint8Array>({
    start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); },
    cancel,
  });
}
const done = encodeChatEvent({ type: "done" });

describe("chat SSE client", () => {
  it("handles every UTF8 byte separately, comments, CRLF and multiple events", async () => {
    const text = ': keepalive\r\nevent: sources\r\ndata: {"type":"sources","citations":[{"documentId":1,"chunkIndex":0,"distance":0.2}]}\r\n\r\nevent: delta\r\ndata: {"type":"delta","text":"Hi 🌍 café"}\r\n\r\nevent: done\r\ndata: {"type":"done"}\r\n\r\n';
    const events: ChatStreamEvent[] = [];
    await consumeChatStream(body([...encoder.encode(text)].map(byte => Uint8Array.of(byte))), event => events.push(event));
    expect(events).toEqual([
      { type: "sources", citations: [{ documentId: 1, chunkIndex: 0, distance: 0.2 }] },
      { type: "delta", text: "Hi 🌍 café" }, { type: "done" },
    ]);
  });

  it("delivers deltas before completion and cancels after done", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; }, cancel });
    const events: ChatStreamEvent[] = [];
    const promise = consumeChatStream(stream, event => events.push(event));
    streamController!.enqueue(encodeChatEvent({ type: "delta", text: "First" }));
    await vi.waitFor(() => expect(events).toEqual([{ type: "delta", text: "First" }]));
    streamController!.enqueue(done);
    await promise;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("supports multiline data and CR line endings", async () => {
    const text = 'event: delta\rdata: {"type":"delta",\rdata: "text":"ok"}\r\revent: done\rdata: {"type":"done"}\r\r';
    const events: ChatStreamEvent[] = [];
    await consumeChatStream(body([encoder.encode(text)]), event => events.push(event));
    expect(events[0]).toEqual({ type: "delta", text: "ok" });
  });

  it.each([
    'event: delta\ndata: {"type":"delta","text":"partial"}\n\n',
    'event: done\ndata: {"type":"done"}',
    'event: delta\ndata: malformed\n\n',
    'event: delta\ndata: {"type":"done"}\n\n',
    'event: unknown\ndata: {"type":"unknown"}\n\n',
    'event: sources\ndata: {"type":"sources","citations":[{"documentId":1}]}\n\n',
  ])("rejects premature EOF or malformed protocol %#", async text => {
    await expect(consumeChatStream(body([encoder.encode(text)]), () => {})).rejects.toThrow("interrupted");
  });

  it("treats error as terminal without exposing arbitrary server text", async () => {
    const events: ChatStreamEvent[] = [];
    await expect(consumeChatStream(body([
      encodeChatEvent({ type: "delta", text: "partial" }),
      encodeChatEvent({ type: "error", message: "secret provider payload" }), done,
    ]), event => events.push(event))).rejects.toThrow("interrupted");
    expect(events.some(event => event.type === "done")).toBe(false);
    expect(JSON.stringify(events)).not.toContain("secret provider payload");
  });

  it("rejects invalid UTF8 instead of silently corrupting an answer", async () => {
    await expect(consumeChatStream(body([Uint8Array.of(0xff), done]), () => {})).rejects.toThrow("interrupted");
  });

  it("cancels a pending read when aborted and releases its reader", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const controller = new AbortController();
    const promise = consumeChatStream(stream, () => {}, controller.signal);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
  });

  it("does not consume an already aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    const event = vi.fn();
    await expect(consumeChatStream(body([done]), event, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(event).not.toHaveBeenCalled();
  });
});
