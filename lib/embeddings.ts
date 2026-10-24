import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbeddings(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: texts,
        encoding_format: "float",
    });

    return response.data.map((item) => item.embedding);
}