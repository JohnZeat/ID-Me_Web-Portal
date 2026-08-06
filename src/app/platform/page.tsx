import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSubscribers } from "./actions";
import { SubscribersTable } from "./subscribers-table";
import { SignOutButton } from "@/components/sign-out-button";

export default async function PlatformPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const result = platformAdmin ? await listSubscribers() : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            Platform Admin — Subscribers
          </h1>
          <SignOutButton />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {!platformAdmin ? (
            <p className="text-sm text-amber-800">
              This area is restricted to ID-Me platform admins.
            </p>
          ) : result?.ok ? (
            <SubscribersTable subscribers={result.data} />
          ) : (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {result?.message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
