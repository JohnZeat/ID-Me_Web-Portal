"use client";

import { useEffect, useRef, useState } from "react";
import { listCustomers, type CustomerEntry } from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";
import { Spinner } from "@/components/spinner";
import { formatDob, type DateFormat } from "@/lib/format-date";

const PAGE_SIZE = 20;

export function CustomersTable({ dateFormat }: { dateFormat: DateFormat }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const requestId = useRef(0);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);

    const runFetch = async () => {
      const result = await listCustomers({ search, page, pageSize: PAGE_SIZE });
      if (id !== requestId.current) return; // superseded by a newer request
      if (result.ok) {
        setCustomers(result.data.customers);
        setTotal(result.data.total);
        setError(null);
      } else {
        setError({ code: result.code, message: result.message });
      }
      setLoading(false);
    };

    // Debounce only applies to subsequent searches (typing) -- the very
    // first fetch, when the tab is first shown, should happen right
    // away rather than after an artificial delay.
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      runFetch();
      return;
    }

    const timeout = setTimeout(runFetch, 300);
    return () => clearTimeout(timeout);
  }, [search, page]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Customers</p>
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or mobile..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 pr-9 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => handleSearchChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Full name</th>
              <th className="px-4 py-2 font-medium">DOB</th>
              <th className="px-4 py-2 font-medium">Mobile</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center">
                  <Spinner className="mx-auto" />
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-3 text-center text-gray-500">
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-gray-900">{c.fullName}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {formatDob(c.dob, dateFormat)}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.mobileNumber}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>
          {total === 0
            ? "0 results"
            : `Page ${page} of ${totalPages} (${total} total)`}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
