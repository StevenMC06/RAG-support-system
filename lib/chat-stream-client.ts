import type { ChatStreamEvent, Citation } from "./chat-events";

export class ChatStreamError extends Error {
  constructor() {
    super("The answer was interrupted. Please try again.");
    this.name = "ChatStreamError";
  }
}

function isCitation(value: unknown): value is Citation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Number.isInteger(item.documentId) && Number.isInteger(item.chunkIndex) &&
    typeof item.distance === "number" && Number.isFinite(item.distance);
}

function parseEvent(data: string, eventName: string): ChatStreamEvent {
  let value: unknown;
  try { value = JSON.parse(data); } catch { throw new ChatStreamError(); }
  if (!value || typeof value !== "object") throw new ChatStreamError();
  const event = value as Record<string, unknown>;
  if (eventName && event.type !== eventName) throw new ChatStreamError();
  switch (event.type) {
    case "sources":
      if (Array.isArray(event.citations) && event.citations.every(isCitation)) {
        return { type: "sources", citations: event.citations };
      }
      break;
    case "delta":
      if (typeof event.text === "string") return { type: "delta", text: event.text };
      break;
    case "done": return { type: "done" };
    case "error":
      // Do not expose arbitrary server/provider payloads in the browser.
      if (typeof event.message === "string") return { type: "error", message: new ChatStreamError().message };
  }
  throw new ChatStreamError();
}

/** Consume our SSE protocol independently of how fetch divides bytes into chunks. */
export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let eventName = "";
  let data: string[] = [];
  let finished = false;
  let eof = false;
  const abort = () => { void reader.cancel().catch(() => {}); };
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  };
  const line = (value: string) => {
    if (value === "") {
      if (data.length) {
        const event = parseEvent(data.join("\n"), eventName);
        onEvent(event);
        if (event.type === "error") throw new ChatStreamError();
        if (event.type === "done") finished = true;
      }
      data = [];
      eventName = "";
      return;
    }
    if (value.startsWith(":")) return;
    const colon = value.indexOf(":");
    const field = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? "" : value.slice(colon + 1);
    if (content.startsWith(" ")) content = content.slice(1);
    if (field === "event") eventName = content;
    if (field === "data") data.push(content);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    checkAbort();
    while (!finished) {
      const chunk = await reader.read();
      checkAbort();
      eof = chunk.done;
      try {
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      } catch { throw new ChatStreamError(); }
      let start = 0;
      for (let i = 0; i < buffer.length && !finished; i++) {
        if (buffer[i] !== "\r" && buffer[i] !== "\n") continue;
        // Keep a trailing CR until the next chunk establishes CRLF vs CR.
        if (buffer[i] === "\r" && i === buffer.length - 1 && !eof) break;
        line(buffer.slice(start, i));
        if (buffer[i] === "\r" && buffer[i + 1] === "\n") i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      if (eof) break;
    }
    if (!finished) throw new ChatStreamError();
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!eof) {
      try { await reader.cancel(); } catch { /* Preserve the protocol/abort error. */ }
    }
    reader.releaseLock();
  }
}
