"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadStaffCsv, type StaffCsvUploadResult } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";

export function StaffCsvUploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<StaffCsvUploadResult | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setResult(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadStaffCsv(formData);
    if (result.ok) {
      setResult(result.data);
      router.refresh();
    } else {
      setError({ code: result.code, message: result.message });
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-gray-700">
        Bulk invite staff (CSV)
      </p>
      <p className="text-xs text-gray-500">
        Columns: full_name, email, role (optional, staff or admin --
        defaults to staff). Each valid row is invited exactly like the
        form above, including the domain check.
      </p>
      <form onSubmit={handleUpload} className="flex items-center gap-3">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm text-gray-700"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Upload"}
        </button>
      </form>

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}

      {result && (
        <div className="rounded-md border border-gray-200 bg-white p-4 text-sm">
          <p className="mb-2 font-medium text-gray-900">
            {result.invited} invite{result.invited === 1 ? "" : "s"} sent
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
