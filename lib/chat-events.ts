/** Browser-safe event contract shared by the streaming route and client. */
export type Citation = {
  documentId: number;
  chunkIndex: number;
  distance: number;
};

export type ChatStreamEvent =
  | { type: "sources"; citations: Citation[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function encodeChatEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
