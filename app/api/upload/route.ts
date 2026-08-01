import { uploadedToS3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
// receive request
export async function POST(request: Request) {
    // TODO: 
// 1. Parse the form data
const formData = await request.formData()

// 2. Extract the uploaded file

const uploadedFile = formData.get("document")

// 3. Validate the file

// TYPE:
if(!(uploadedFile instanceof File)) {


    return Response.json (
    {
        success: false,
        error: "No valid file uploaded"
    });
}
console.log("POST endpoint hit");
console.log(uploadedFile);

// - Is a PDF

if(uploadedFile.type !== "application/pdf") {
    return Response.json(
        {
            success: false,
            error: "Only PDF files are allowed",
        },
        {
            status:400,
        }
    
    );
}

// - IS below max size

const MAX_FILE_SIZE = 10 * 1024 * 1024; 

if(uploadedFile.size > MAX_FILE_SIZE) {
    return Response.json(
    {
        success: false,
        error: "Exceeds max size",
    },
    {
        status:400,
    }
    );
}

// 4. Save the file to S3
try {
    const s3Key = await uploadedToS3(uploadedFile);

    const document = await prisma.document.create({
        data: {
            filename: uploadedFile.name,
            storagePath: s3Key,
            fileType: uploadedFile.type,
            fileSize: uploadedFile.size,
            status: "uploaded",
        },
    });
    return Response.json({
        success: true,
        document,
    });

} catch (error) {
    console.error("Upload failed:", error);

    return Response.json(
        {
            success: false,
            error: "Unable to store the uploaded file",
        },
        {
            status: 500,
        }
    );
}
}
