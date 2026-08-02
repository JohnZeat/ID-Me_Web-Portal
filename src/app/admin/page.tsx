import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CsvUploadPanel } from "./csv-upload-panel";
import { InviteStaffPanel } from "./invite-staff-panel";
import { listStaff } from "./actions";

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

  const isAdmin = !!staff && staff.role === "admin";
  const staffListResult = isAdmin ? await listStaff() : null;
  const staffList = staffListResult?.ok ? staffListResult.data : [];

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
              <div>
                <p className="mb-3 text-sm font-medium text-gray-700">
                  Current staff
                </p>
                {staffListResult && !staffListResult.ok ? (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    {staffListResult.error}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-200 rounded-md border border-gray-200">
                    {staffList.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between px-4 py-2 text-sm"
                      >
                        <span className="text-gray-900">{s.email}</span>
                        <span className="text-gray-500">{s.role}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <InviteStaffPanel />

              <CsvUploadPanel />

              <p className="text-sm text-gray-600">
                API key management, company settings, and the audit log land
                here — build sequencing step 3 in the solution design.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
