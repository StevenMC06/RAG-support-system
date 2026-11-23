import { timeRequest } from "@/lib/telemetry";

import { retrieveChunks } from "@/lib/retrieval";

export async function POST(request: Request) {
  return timeRequest("POST /api/search", async (trace) => {
    try {
      const body = await request.json();
      const question = body.question;

      // 1. Validate user input
      if (
        typeof question !== "string" ||
        !question.trim() ||
        question.length > 2000
      ) {
        return Response.json(
          { success: false, message: "Invalid question" },
          { status: 400 }
        );
      }

      // 2. Generate embedding and search PostgreSQL
      const results = await retrieveChunks(question.trim(), 5, trace);

      // 3. Return results
      return Response.json({
        success: true,
        question: question.trim(),
        results,
      });
    } catch {
      return Response.json(
        { success: false, message: "Search failed" },
        { status: 500 }
      );
    }
  });
}
