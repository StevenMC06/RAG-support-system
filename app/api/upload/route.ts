
// receive request

export async function POST(request: Request) {
    // TODO: 
// 1. Parse the form data
const formData = await request.formData()

// other varaibles needed

// 2. Extract the uploaded file
const uploadedFile = formData.get("document")
// 3. Validate the file
// TODO
// - File exists?
// - Is a PDF
// - IS below max size

// 4. Save the file locally
// TODO

// 5. Return success
    return Response.json({
        success:true,
    });
}
