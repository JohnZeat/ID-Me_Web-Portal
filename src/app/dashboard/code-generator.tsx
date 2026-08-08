"use client";

import { useEffect, useRef, useState } from "react";
import {
  createCustomer,
  generateCode,
  searchCustomers,
  type CustomerSearchResult,
  type GeneratedCode,
} from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";
import { Spinner } from "@/components/spinner";
import { formatDob, type DateFormat } from "@/lib/format-date";

function useCountdown(expiresAt: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;

    const tick = () => {
      const diff = Math.max(
        0,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return secondsLeft;
}

export function CodeGeneratorPanel({ dateFormat }: { dateFormat: DateFormat }) {
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");

  const [results, setResults] = useState<CustomerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [generated, setGenerated] = useState<GeneratedCode | null>(null);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const secondsLeft = useCountdown(generated?.expires_at ?? null);
  const searchRequestId = useRef(0);

  async function runSearch() {
    setError(null);
    setSelected(null);
    setGenerated(null);
    setShowCreateForm(false);
    setSearching(true);
    const requestId = ++searchRequestId.current;
    const result = await searchCustomers({ fullName, dob, mobileNumber });
    if (requestId !== searchRequestId.current) return; // superseded by a newer search
    if (result.ok) {
      setResults(result.data);
      setSearched(true);
    } else {
      setError({ code: result.code, message: result.message });
    }
    setSearching(false);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  // Live search as you type: fires ~300ms after typing pauses, so
  // finding a customer among potentially thousands never requires
  // loading the full list into the browser -- each keystroke pause
  // just re-queries the (already company-scoped, limited) search.
  useEffect(() => {
    const hasEnoughInput =
      fullName.trim().length >= 2 || mobileNumber.trim().length >= 2 || !!dob;

    if (!hasEnoughInput) {
      searchRequestId.current++; // invalidate any in-flight search
      setResults([]);
      setSearched(false);
      return;
    }

    const timeout = setTimeout(() => {
      runSearch();
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, dob, mobileNumber]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const result = await createCustomer({ fullName, dob, mobileNumber });
    if (result.ok) {
      setSelected(result.data);
      setShowCreateForm(false);
    } else {
      setError({ code: result.code, message: result.message });
    }
    setCreating(false);
  }

  async function handleGenerate() {
    if (!selected) return;
    setError(null);
    setGenerating(true);
    const result = await generateCode(selected.id);
    if (result.ok) {
      setGenerated(result.data);
    } else {
      setError({ code: result.code, message: result.message });
    }
    setGenerating(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Find a customer</p>
        <p className="text-xs text-gray-500">
          Results appear as you type (name or mobile, 2+ characters, or pick a
          DOB).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
          />
          <input
            type="date"
            placeholder="DOB"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
          />
          <input
            type="tel"
            placeholder="Mobile (+61...)"
            value={mobileNumber}
            onChange={(e) => setMobileNumber(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <ErrorGuidance code={error.code} fallback={error.message} />}

      {!selected && searching && (
        <div className="flex justify-center rounded-md border border-gray-200 bg-white p-6">
          <Spinner />
        </div>
      )}

      {!selected && !searching && searched && (
        <div className="rounded-md border border-gray-200 bg-white">
          {results.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              <p className="mb-3">No matching customer found.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Create new customer
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelected(c)}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">
                      {c.full_name}
                    </span>
                    <span className="ml-2 text-gray-500">
                      {formatDob(c.dob, dateFormat)} · {c.mobile_number}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-md border border-gray-200 bg-white p-4"
        >
          <p className="text-sm font-medium text-gray-700">
            New customer details
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            />
            <input
              type="date"
              required
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            />
            <input
              type="tel"
              required
              placeholder="+61412345678"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create customer"}
          </button>
        </form>
      )}

      {selected && (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <p className="mb-1 text-sm text-gray-500">Selected customer</p>
          <p className="mb-4 text-sm font-medium text-gray-900">
            {selected.full_name} · {formatDob(selected.dob, dateFormat)} ·{" "}
            {selected.mobile_number}
          </p>

          {!generated ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate Code"}
            </button>
          ) : (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
              <p className="text-3xl font-semibold tracking-widest text-gray-900">
                {generated.code}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {secondsLeft > 0 ? `Expires in ${secondsLeft}s` : "Expired"}
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="mt-3 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {generating ? "Resending..." : "Resend Code"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
