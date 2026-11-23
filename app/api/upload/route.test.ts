import { beforeEach, describe, expect, it, vi } from "vitest";

const { documentCreate, uploadedToS3 } = vi.hoisted(() => ({
  documentCreate: vi.fn(),
  uploadedToS3: vi.fn(),
}));

vi.mock("@/lib/s3", () => ({ uploadedToS3 }));
vi.mock("@/lib/prisma", () => ({
  prisma: { document: { create: documentCreate } },
}));

import { POST } from "./route";

function uploadRequest(file?: File) {
  const formData = new FormData();
  if (file) formData.set("document", file);

  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a missing file without persisting anything", async () => {
    const response = await POST(uploadRequest());

    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "No valid file uploaded",
    });
    expect(uploadedToS3).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it("rejects non-PDF files", async () => {
    const response = await POST(
      uploadRequest(new File(["hello"], "note.txt", { type: "text/plain" }))
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Only PDF files are allowed",
    });
  });

  it("uploads a valid PDF and persists its metadata", async () => {
    const file = new File(["pdf content"], "guide.pdf", { type: "application/pdf" });
    uploadedToS3.mockResolvedValue("documents/guide.pdf");
    const document = { id: 9, filename: "guide.pdf" };
    documentCreate.mockResolvedValue(document);

    const response = await POST(uploadRequest(file));

    expect(uploadedToS3).toHaveBeenCalledWith(expect.objectContaining({ name: "guide.pdf" }));
    expect(documentCreate).toHaveBeenCalledWith({
      data: {
        filename: "guide.pdf",
        storagePath: "documents/guide.pdf",
        fileType: "application/pdf",
        fileSize: file.size,
        status: "uploaded",
      },
    });
    await expect(response.json()).resolves.toEqual({ success: true, document });
  });

  it("returns a safe error when storage fails", async () => {
    uploadedToS3.mockRejectedValue(new Error("S3 unavailable"));

    const response = await POST(
      uploadRequest(new File(["pdf"], "guide.pdf", { type: "application/pdf" }))
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Unable to store the uploaded file",
    });
  });
});
