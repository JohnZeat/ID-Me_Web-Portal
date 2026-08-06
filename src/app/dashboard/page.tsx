import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { CodeGeneratorPanel } from "./code-generator";
import type { DateFormat } from "@/lib/format-date";
import { isSuspended, isTrialExpired, trialDaysRemaining } from "@/lib/subscription";

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
  let suspended = false;
  let expired = false;
  let daysLeft: number | null = null;

  if (staff) {
    const { data: company } = await supabase
      .from("companies")
      .select("date_format, subscription_status, trial_ends_at, suspended_at")
      .eq("id", staff.company_id)
      .maybeSingle();
    if (company) {
      dateFormat = company.date_format;
      suspended = isSuspended(company);
      expired = isTrialExpired(company);
      daysLeft = trialDaysRemaining(company);
    }
  }

  const locked = suspended || expired;
  const isAdmin = staff?.role === "admin";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Staff Dashboard
          </h1>
          <div className="flex items-center gap-4">
            {isAdmin && (
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
          ) : locked ? (
            <>
              <p className="mb-6 text-lg font-medium text-gray-900">
                Hi {staff.full_name ?? user.email}
              </p>
              <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
                {suspended ? (
                  <p className="text-sm text-amber-800">
                    Your company&apos;s account has been suspended. Contact
                    support for details.
                  </p>
                ) : isAdmin ? (
                  <p className="text-sm text-amber-800">
                    Your free trial has ended.{" "}
                    <Link href="/admin" className="font-medium underline">
                      Go to Admin
                    </Link>{" "}
                    to subscribe and continue.
                  </p>
                ) : (
                  <p className="text-sm text-amber-800">
                    Your company&apos;s free trial has ended. Contact your
                    company admin to subscribe.
                  </p>
                )}
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
