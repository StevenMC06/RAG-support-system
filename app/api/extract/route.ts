import { prisma } from "@/lib/prisma";
import { downloadFromS3 } from "@/lib/s3";
import { PDFParse } from "pdf-parse";
import { chunkText } from "@/lib/chunkTest";

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


    // chunk the text into 500 token chunks await response

    const chunks = chunkText(result.text, {
        targetTokens: 500,
        maxTokens: 600,
        overlapTokens: 75,
    });


    // delete the existing chunks if old
    await prisma.documentChunk.deleteMany({
        where: {
            documentId: document.id,
        },
    });

    // create the chunks in the database
    await prisma.documentChunk.createMany({
        data: chunks.map((chunk, index) => ({
            documentId: document.id,
            chunkIndex: index,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
        })),
    })

    // update the document status to processed
    await prisma.document.update({
        where: {
            id: document.id,
        },
        data: {
            status: "processed",
        },
    });

    // return the success response
    return Response.json({
        success: true,
        documentId: document.id,
        filename: document.filename,
        downloadedBytes: pdfBuffer.length,
        extractedCharacters: result.text.length,
        chunkCount: chunks.length,
        chunks: chunks.slice(0, 3),
    });
}