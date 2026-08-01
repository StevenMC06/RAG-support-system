import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,    }
});

export async function uploadedToS3(file: File) {
    // convert browser FIle -> Node Buffer

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const extension = file.name.split(".").pop() ?? "pdf";
    const key = `${randomUUID()}.${extension}`;
    // upload to s3
    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
            Body: buffer,
            ContentType: file.type,
        })
    );

    return key;
}

export async function downloadFromS3(key: string) {
    const response = await s3.send( 
        new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: key,
        })
    );

    if (!response.Body) {
        throw new Error("S3 object has no body");
    }

    const body = await response.Body.transformToByteArray();

    return Buffer.from(body);
}