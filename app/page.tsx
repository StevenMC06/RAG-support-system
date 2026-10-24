
"use client";

import { useState } from "react";

type Citation = {
  documentId: number;
  chunkIndex: number;
  distance: number;
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function askQuestion() {
    if (!question.trim() || loading) return;

    setLoading(true);
    setError("");
    setAnswer("");
    setCitations([]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Request failed");
      }

      setAnswer(data.answer);
      setCitations(data.citations ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setLoading(false);
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
          {loading ? "Searching..." : "Ask Question"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-6 text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {answer && (
        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold">Answer</h2>
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
