import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Staff Dashboard
          </h1>
          <SignOutButton />
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
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
              <p className="mb-3 text-sm text-gray-600">
                Code generation (customer lookup + 6-digit code + 2-minute
                expiry) plugs in here — next build phase, once the{" "}
                <code className="rounded bg-gray-200 px-1 py-0.5 text-xs">
                  codes
                </code>{" "}
                table exists in Supabase.
              </p>
              <button
                disabled
                className="rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-500"
                title="Wired up once the codes table is in place"
              >
                Generate Code
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
