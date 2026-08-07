"use client";

import { useState, type ReactNode } from "react";

const TABS = ["Staff", "Customers", "Subscription", "Settings", "API", "Audit"] as const;
type Tab = (typeof TABS)[number];

export function AdminTabs({
  staff,
  customers,
  subscription,
  settings,
  api,
  audit,
}: {
  staff: ReactNode;
  customers: ReactNode;
  subscription: ReactNode;
  settings: ReactNode;
  api: ReactNode;
  audit: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("Staff");

  const content: Record<Tab, ReactNode> = {
    Staff: staff,
    Customers: customers,
    Subscription: subscription,
    Settings: settings,
    API: api,
    Audit: audit,
  };

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
      <nav className="flex shrink-0 gap-1 overflow-x-auto sm:w-40 sm:flex-col sm:overflow-visible">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`rounded-md px-3 py-2 text-left text-sm font-medium whitespace-nowrap ${
              active === tab
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {TABS.map((tab) => (
          // Kept mounted (CSS-hidden) rather than conditionally rendered,
          // so switching tabs doesn't unmount/remount CustomersTable and
          // AuditLogTable -- those self-fetch on mount, so remounting
          // them every switch meant refetching from scratch every time.
          <div key={tab} className={tab === active ? "space-y-8" : "hidden"}>
            {content[tab]}
          </div>
        ))}
      </div>
    </div>
  );
}
