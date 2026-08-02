"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateCompanySettings,
  addCompanyDomain,
  removeCompanyDomain,
  type CompanyDomainEntry,
} from "./actions";
import { ErrorGuidance } from "@/components/error-guidance";
import { DATE_FORMATS, type DateFormat } from "@/lib/format-date";

export function CompanySettingsPanel({
  initialName,
  initialCodeExpirySeconds,
  initialDateFormat,
  initialDomains,
}: {
  initialName: string;
  initialCodeExpirySeconds: number;
  initialDateFormat: DateFormat;
  initialDomains: CompanyDomainEntry[];
}) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [codeExpirySeconds, setCodeExpirySeconds] = useState(
    String(initialCodeExpirySeconds)
  );
  const [dateFormat, setDateFormat] = useState<DateFormat>(initialDateFormat);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<{ code: string; message: string } | null>(
    null
  );

  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [domainError, setDomainError] = useState<{ code: string; message: string } | null>(
    null
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSaved(false);
    setSavingSettings(true);
    const result = await updateCompanySettings({
      name,
      codeExpirySeconds: Number(codeExpirySeconds),
      dateFormat,
    });
    if (result.ok) {
      setSettingsSaved(true);
      router.refresh();
    } else {
      setSettingsError({ code: result.code, message: result.message });
    }
    setSavingSettings(false);
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    setDomainError(null);
    setAddingDomain(true);
    const result = await addCompanyDomain(newDomain);
    if (result.ok) {
      setNewDomain("");
      router.refresh();
    } else {
      setDomainError({ code: result.code, message: result.message });
    }
    setAddingDomain(false);
  }

  async function handleRemoveDomain(id: string) {
    setDomainError(null);
    setRemovingId(id);
    const result = await removeCompanyDomain(id);
    if (!result.ok) {
      setDomainError({ code: result.code, message: result.message });
    }
    setRemovingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSaveSettings} className="space-y-3">
        <p className="text-sm font-medium text-gray-700">General</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Company name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Code expiry (seconds)
            </label>
            <input
              type="number"
              required
              min={1}
              max={3600}
              value={codeExpirySeconds}
              onChange={(e) => setCodeExpirySeconds(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Date format (for DOB, etc.)
            </label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={savingSettings}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {savingSettings ? "Saving..." : "Save"}
        </button>
        {settingsSaved && <p className="text-sm text-green-700">Settings saved.</p>}
        {settingsError && (
          <ErrorGuidance code={settingsError.code} fallback={settingsError.message} />
        )}
      </form>

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">Registered domains</p>
        <p className="text-xs text-gray-500">
          Staff can only be invited using an email at one of these domains.
        </p>
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
          {initialDomains.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">
              No domains registered yet.
            </li>
          )}
          {initialDomains.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span className="text-gray-900">{d.domain}</span>
              <button
                onClick={() => handleRemoveDomain(d.id)}
                disabled={removingId === d.id}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {removingId === d.id ? "Removing..." : "Remove"}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAddDomain} className="flex gap-3">
          <input
            type="text"
            required
            placeholder="company.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:border-gray-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={addingDomain}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {addingDomain ? "Adding..." : "Add domain"}
          </button>
        </form>
        {domainError && (
          <ErrorGuidance code={domainError.code} fallback={domainError.message} />
        )}
      </div>
    </div>
  );
}
