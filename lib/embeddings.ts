import { timeOperation, type TraceContext } from "@/lib/telemetry";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbeddings(
    texts: string[],
    trace?: TraceContext
): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    const response = await timeOperation(trace, { kind: "model", name: "embedding.generate", provider: "openai", model: "text-embedding-3-small" }, async () => openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float",
    }), (result) => ({ providerRequestId: result._request_id ?? undefined }));

    return response.data.map((item) => item.embedding);
}
