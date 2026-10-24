import { prisma } from "@/lib/prisma";
import { downloadFromS3 } from "@/lib/s3";
import { PDFParse } from "pdf-parse";
import { chunkText } from "@/lib/chunkTest";
import { createEmbeddings } from "@/lib/embeddings";

export async function POST(request: Request) {
    const body = await request.json();

    const { documentId } = body;

    if(typeof documentId !== "number") {
        return Response.json(
            {
                success: false,
                message: "Invalid document ID",
            },

            {
                status: 400,
            }
        );
    }

    const document = await prisma.document.findUnique({
        where: {
            id: documentId,
        },

    });
    
    if(!document) {
        return Response.json(
            {
                success: false,
                message: "Document not found",

            },
            {
                status: 404,
            }
        );
    }

    const pdfBuffer = await downloadFromS3(document.storagePath);
    console.log(pdfBuffer);

    const parser = new PDFParse({
        data: pdfBuffer,
    });
    
    const result = await parser.getText();

    await parser.destroy();


    const chunks = chunkText(result.text, {
        targetTokens: 500,
        maxTokens: 600,
        overlapTokens: 75,
    });

    if (chunks.length === 0) {
        throw new Error("No chunks were generated");
    }
    
    const embeddings = await createEmbeddings(
        chunks.map((chunk) => chunk.content)
    );
    
    if (embeddings.length !== chunks.length) {
        throw new Error(
            `Expected ${chunks.length} embeddings, received ${embeddings.length}`
        );
    }

    // delete the existing chunks if old
    await prisma.documentChunk.deleteMany({
        where: {
            documentId: document.id,
        },
    });

    // create the chunks in the database
    await prisma.documentChunk.createMany({
        data: chunks.map((chunk) => ({
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
        })),
    });

    const values = chunks.map((chunk, i) => {
        const embedding = `[${embeddings[i].join(",")}]`;
    
        return `(${document.id}, ${chunk.chunkIndex}, '${embedding}'::vector)`;
    });
    
    const valuesSql = values.join(",");
    
    await prisma.$executeRawUnsafe(`
        UPDATE "DocumentChunk" AS dc
        SET "embedding" = updates.embedding
        FROM (
            VALUES ${valuesSql}
        ) AS updates("documentId", "chunkIndex", embedding)
        WHERE dc."documentId" = updates."documentId"
          AND dc."chunkIndex" = updates."chunkIndex";
    `);

    // persist each embedding
    let updatedEmbeddings = 0;

    for (let i = 0; i < chunks.length; i++) {
        const embedding = `[${embeddings[i].join(",")}]`;

        const updated = await prisma.$executeRaw`
            UPDATE "DocumentChunk"
            SET "embedding" = ${embedding}::vector
            WHERE "documentId" = ${document.id}
            AND "chunkIndex" = ${chunks[i].chunkIndex}
        `;

        updatedEmbeddings += updated;
    }

    return Response.json({
        success: true,
        documentId: document.id,
        chunkCount: chunks.length,
        embeddingCount: embeddings.length,
        embeddingDimensions: embeddings[0]?.length ?? 0,
        updatedEmbeddings,
    });
}