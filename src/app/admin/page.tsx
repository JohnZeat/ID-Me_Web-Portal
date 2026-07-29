import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // TODO(build sequencing step 3): gate this on an "Admin" role once
  // roles live in Supabase (staff table + RLS), not just "is logged in."

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-xl font-semibold text-gray-900">
          Admin Area
        </h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">
            Staff management, API key management, company settings, and the
            audit log land here — build sequencing step 3 in the solution
            design, after the core verification loop and customer list
            sync are working.
          </p>
        </div>
      </div>
    </main>
  );
}
