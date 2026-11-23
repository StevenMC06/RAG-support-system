
"use client";

import { useEffect, useRef, useState } from "react";
import type { Citation } from "@/lib/chat-events";
import { consumeChatStream } from "@/lib/chat-stream-client";

type BrowserRequest = {
  controller: AbortController;
  startedAt: number;
  requestId: string | null;
  firstTextMs?: number;
  paintFrame?: number;
  settled?: boolean;
};

function logTiming(metadata: Record<string, string | number | undefined | null>) {
  try { console.info(JSON.stringify({ event: "browser.chat", ...metadata })); } catch { /* best effort */ }
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"searching" | "answering">("searching");
  const [error, setError] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const active = useRef<BrowserRequest | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const run = active.current;
      run?.controller.abort();
      if (run?.paintFrame !== undefined) cancelAnimationFrame(run.paintFrame);
    };
  }, []);

  useEffect(() => {
    const run = active.current;
    if (!answer || !run || run.firstTextMs !== undefined || run.paintFrame !== undefined) return;
    // The effect runs after the text is committed. The next frame approximates
    // its presentation, rather than measuring only the network chunk arrival.
    run.paintFrame = requestAnimationFrame(() => {
      run.paintFrame = undefined;
      if (!mounted.current || active.current !== run) return;
      run.firstTextMs = performance.now() - run.startedAt;
      logTiming({ phase: "first_text", requestId: run.requestId, firstTextMs: run.firstTextMs });
    });
  }, [answer]);

  async function askQuestion() {
    if (!question.trim() || active.current && !active.current.settled) return;
    // A pending first-paint measurement belongs to the old answer. Only
    // replacement/unmount cancels it; incoming deltas must not postpone it.
    if (active.current?.paintFrame !== undefined) cancelAnimationFrame(active.current.paintFrame);
    const run: BrowserRequest = {
      controller: new AbortController(), startedAt: performance.now(), requestId: null,
    };
    active.current = run;
    const current = () => mounted.current && active.current === run;
    let outcome = "failure";
    setLoading(true);
    setPhase("searching");
    setError("");
    setAnswer("");
    setCitations([]);
    setIncomplete(false);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ question: question.trim() }),
        signal: run.controller.signal,
      });
      run.requestId = response.headers.get("X-Request-ID");
      if (!response.ok) throw new Error("Chat failed. Please try again.");
      if (response.headers.get("Content-Type")?.toLowerCase().includes("text/event-stream")) {
        if (!response.body) throw new Error("No answer stream was received.");
        await consumeChatStream(response.body, (event) => {
          if (!current()) return;
          if (event.type === "sources") {
            setCitations(event.citations);
            setPhase("answering");
          } else if (event.type === "delta") {
            setAnswer(previous => previous + event.text);
          }
        }, run.controller.signal);
      } else {
        const data = await response.json();
        if (!data.success || typeof data.answer !== "string") throw new Error("Chat failed. Please try again.");
        if (current()) {
          setPhase("answering");
          setAnswer(data.answer);
          setCitations(Array.isArray(data.citations) ? data.citations : []);
        }
      }
      if (run.controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
      outcome = "success";
    } catch {
      outcome = run.controller.signal.aborted ? "cancelled" : "failure";
      if (current()) {
        setIncomplete(true);
        setError(outcome === "cancelled" ? "Stopped. The answer is incomplete." : "The answer was interrupted. Please try again.");
      }
    } finally {
      run.settled = true;
      logTiming({ phase: "completed", requestId: run.requestId, firstTextMs: run.firstTextMs,
        durationMs: performance.now() - run.startedAt, outcome });
      if (current()) setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-900 dark:text-slate-100">
      <h1 className="mb-2 text-3xl font-bold">
        RAG Support System
      </h1>

      <p className="mb-8 text-slate-600 dark:text-slate-300">
        Ask questions about your uploaded documents.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          askQuestion();
        }}
        className="space-y-4"
      >
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          aria-label="Question"
          placeholder="Ask a question about your documents..."
          maxLength={2000}
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white p-4 text-slate-900 placeholder:text-slate-500 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400"
        />

        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400 dark:focus:ring-blue-400 dark:focus:ring-offset-slate-950"
        >
          {loading ? phase === "searching" ? "Searching..." : "Answering..." : "Ask Question"}
        </button>
        {loading && (
          <button type="button" onClick={() => active.current?.controller.abort()}
            className="ml-3 rounded-lg border border-slate-300 px-6 py-3 font-medium hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:border-slate-700 dark:hover:bg-slate-800">
            Stop
          </button>
        )}
      </form>

      {error && (
        <p role="status" className="mt-6 text-slate-600 dark:text-slate-300">
          {error}
        </p>
      )}

      {answer && (
        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Answer{incomplete ? " (incomplete)" : ""}</h2>
          <p className="whitespace-pre-wrap">{answer}</p>

          {citations.length > 0 && (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="mb-2 font-semibold">
                Retrieved Sources
              </h3>

              <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {citations.map((citation) => (
                  <li
                    key={`${citation.documentId}-${citation.chunkIndex}`}
                  >
                    Document {citation.documentId},
                    Chunk {citation.chunkIndex}
                    {" — "}
                    Distance: {citation.distance.toFixed(3)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
