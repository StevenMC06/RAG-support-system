"use client";

import { useState} from "react";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null> (null);

  async function handleUpload() {
    if(!selectedFile) {
      alert("Please select a file.");
      return; 
    }

    const formData = new FormData();  

    // MUST match the backend
    formData.append("document", selectedFile);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      alert(data?.error ?? "Upload failed");
      return;
    }

    console.log(data);
    alert("Upload successful");
  }
    return (
        <main>
            <h1>RAG Support System</h1>

            <input type="file" 
            onChange={(event) => {
              if(event.target.files?.length) {
                setSelectedFile(event.target.files[0]);
              }
            }}
          />

          <br />
          <br />

          <button onClick={handleUpload}>
               Upload
          </button>
        </main>
    );
}