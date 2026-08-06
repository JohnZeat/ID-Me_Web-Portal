import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import { CodeGeneratorPanel } from "./code-generator";
import type { DateFormat } from "@/lib/format-date";
import { isTrialExpired, trialDaysRemaining } from "@/lib/subscription";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("company_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  let dateFormat: DateFormat = "DD/MM/YYYY";
  let expired = false;
  let daysLeft: number | null = null;

  if (staff) {
    const { data: company } = await supabase
      .from("companies")
      .select("date_format, subscription_status, trial_ends_at")
      .eq("id", staff.company_id)
      .maybeSingle();
    if (company) {
      dateFormat = company.date_format;
      expired = isTrialExpired(company);
      daysLeft = trialDaysRemaining(company);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Staff Dashboard
          </h1>
          <div className="flex items-center gap-4">
            {staff?.role === "admin" && (
              <Link
                href="/admin"
                className="text-sm font-medium text-gray-500 hover:text-gray-900"
              >
                Admin
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {!staff ? (
            <>
              <p className="mb-1 text-sm text-gray-500">Signed in as</p>
              <p className="mb-6 text-sm font-medium text-gray-900">
                {user.email}
              </p>
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
                <p className="text-sm text-amber-800">
                  Your account isn&apos;t provisioned for any company yet.
                  Contact your admin to be added as staff.
                </p>
              </div>
            </>
          ) : expired ? (
            <>
              <p className="mb-6 text-lg font-medium text-gray-900">
                Hi {staff.full_name ?? user.email}
              </p>
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
                <p className="text-sm text-amber-800">
                  Your free trial has ended. Subscribing is coming soon — for
                  now, please contact support to continue.
                </p>
              </div>
            </>
          ) : (
            <>
              <p
                className={`text-lg font-medium text-gray-900 ${
                  daysLeft !== null ? "mb-1" : "mb-6"
                }`}
              >
                Hi {staff.full_name ?? user.email}, what would you like to do?
              </p>
              {daysLeft !== null && (
                <p className="mb-5 text-sm text-gray-500">
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left in your free
                  trial.
                </p>
              )}
              <CodeGeneratorPanel dateFormat={dateFormat} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}
