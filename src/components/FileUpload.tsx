"use client";

import { useCallback, useState } from "react";

interface FileUploadProps {
  onExtracted: (data: unknown) => void;
  disabled?: boolean;
}

export default function FileUpload({ onExtracted, disabled }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Extraction failed");
        }

        const result = await res.json();
        onExtracted(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onExtracted]
  );

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${disabled || uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="text-sm text-gray-600">
              Extracting data from <span className="font-medium">{fileName}</span>...
            </p>
          </div>
        ) : (
          <>
            <div className="text-4xl mb-3">📄</div>
            <p className="text-sm text-gray-600 mb-1">
              Drag & drop a file here, or click to browse
            </p>
            <p className="text-xs text-gray-400">
              JPG, PNG, PDF, DOC, DOCX, TXT, XLS, XLSX, CSV — max 20MB
            </p>
            <input
              type="file"
              onChange={handleFileInput}
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
