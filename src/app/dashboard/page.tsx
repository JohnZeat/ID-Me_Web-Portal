import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";
import { CodeGeneratorPanel } from "./code-generator";
import type { DateFormat } from "@/lib/format-date";

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
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();

  let dateFormat: DateFormat = "DD/MM/YYYY";
  if (staff) {
    const { data: company } = await supabase
      .from("companies")
      .select("date_format")
      .eq("id", staff.company_id)
      .maybeSingle();
    if (company) dateFormat = company.date_format;
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
          <p className="mb-1 text-sm text-gray-500">Signed in as</p>
          <p className="mb-6 text-sm font-medium text-gray-900">
            {user.email}
          </p>

          {!staff ? (
            <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-6 text-center">
              <p className="text-sm text-amber-800">
                Your account isn&apos;t provisioned for any company yet.
                Contact your admin to be added as staff.
              </p>
            </div>
          ) : (
            <CodeGeneratorPanel dateFormat={dateFormat} />
          )}
        </div>
      </div>
    </main>
  );
}
