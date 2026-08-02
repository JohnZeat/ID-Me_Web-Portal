import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CsvUploadPanel } from "./csv-upload-panel";

export default async function AdminPage() {
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
        <h1 className="mb-8 text-xl font-semibold text-gray-900">
          Admin Area
        </h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {!staff ? (
            <p className="text-sm text-amber-800">
              Your account isn&apos;t provisioned for any company yet.
              Contact your admin to be added as staff.
            </p>
          ) : staff.role !== "admin" ? (
            <p className="text-sm text-amber-800">
              This area is restricted to company admins.
            </p>
          ) : (
            <div className="space-y-8">
              <CsvUploadPanel />
              <p className="text-sm text-gray-600">
                Staff management, API key management, company settings, and
                the audit log land here — build sequencing step 3 in the
                solution design.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
