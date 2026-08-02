"use client";

import { useState } from "react";
import { uploadCustomersCsv, type CsvUploadResult } from "./actions";

export function CsvUploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CsvUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadCustomersCsv(formData);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">
        Upload customer list (CSV)
      </p>
      <p className="text-xs text-gray-500">
        Columns: full_name, dob (YYYY-MM-DD), mobile_number (+61...),
        metadata (optional JSON). Matches existing customers by full_name +
        dob and updates them; unmatched rows are inserted as new customers.
      </p>
      <form onSubmit={handleUpload} className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm">
          <p className="mb-2 font-medium text-gray-900">
            {result.upserted} customer{result.upserted === 1 ? "" : "s"}{" "}
            upserted
            {result.skipped.length > 0 &&
              `, ${result.skipped.length} row${
                result.skipped.length === 1 ? "" : "s"
              } skipped`}
          </p>
          {result.skipped.length > 0 && (
            <ul className="space-y-1 text-gray-600">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
