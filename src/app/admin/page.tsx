import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CsvUploadPanel } from "./csv-upload-panel";
import { InviteStaffPanel } from "./invite-staff-panel";
import { StaffCsvUploadPanel } from "./staff-csv-upload-panel";
import { CompanySettingsPanel } from "./company-settings-panel";
import { StaffList } from "./staff-list";
import { ApiKeyPanel } from "./api-key-panel";
import {
  listStaff,
  getCompanySettings,
  listCompanyDomains,
  listApiKeys,
} from "./actions";
import { getErrorGuidanceForStaff } from "@/lib/error-guidance";

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
  const staffListGuidance =
    staffListResult && !staffListResult.ok
      ? await getErrorGuidanceForStaff(staffListResult.code)
      : null;

  const settingsResult = isAdmin ? await getCompanySettings() : null;
  const domainsResult = isAdmin ? await listCompanyDomains() : null;
  const settingsFailure =
    settingsResult && !settingsResult.ok
      ? settingsResult
      : domainsResult && !domainsResult.ok
        ? domainsResult
        : null;
  const settingsGuidance = settingsFailure
    ? await getErrorGuidanceForStaff(settingsFailure.code)
    : null;

  const apiKeysResult = isAdmin ? await listApiKeys() : null;
  const apiKeysGuidance =
    apiKeysResult && !apiKeysResult.ok
      ? await getErrorGuidanceForStaff(apiKeysResult.code)
      : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Admin Area
          </h1>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Back to Dashboard
          </Link>
        </div>
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
                  staffListGuidance ? (
                    <div
                      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                      dangerouslySetInnerHTML={{ __html: staffListGuidance.html }}
                    />
                  ) : (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                      {staffListResult.message}
                    </p>
                  )
                ) : (
                  <StaffList staffList={staffList} currentUserId={user.id} />
                )}
              </div>

              <InviteStaffPanel />

              <StaffCsvUploadPanel />

              <CsvUploadPanel />

              <div>
                <p className="mb-3 text-sm font-medium text-gray-700">
                  Company settings
                </p>
                {settingsFailure ? (
                  settingsGuidance ? (
                    <div
                      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                      dangerouslySetInnerHTML={{ __html: settingsGuidance.html }}
                    />
                  ) : (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                      {settingsFailure.message}
                    </p>
                  )
                ) : (
                  settingsResult?.ok &&
                  domainsResult?.ok && (
                    <CompanySettingsPanel
                      initialName={settingsResult.data.name}
                      initialCodeExpirySeconds={settingsResult.data.codeExpirySeconds}
                      initialDateFormat={settingsResult.data.dateFormat}
                      initialDomains={domainsResult.data}
                    />
                  )
                )}
              </div>

              <div>
                {apiKeysResult && !apiKeysResult.ok ? (
                  apiKeysGuidance ? (
                    <div
                      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                      dangerouslySetInnerHTML={{ __html: apiKeysGuidance.html }}
                    />
                  ) : (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                      {apiKeysResult.message}
                    </p>
                  )
                ) : (
                  apiKeysResult?.ok && (
                    <ApiKeyPanel initialKeys={apiKeysResult.data} />
                  )
                )}
              </div>

              <p className="text-sm text-gray-600">
                The audit log lands here — build sequencing step 3 in the
                solution design.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
