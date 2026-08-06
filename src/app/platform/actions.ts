"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, AppError, type ActionResult } from "@/lib/action-result";
import { GLOBAL_COMPANY_ID } from "@/lib/error-guidance";

// platform_admins RLS only allows viewing your own row, which is
// exactly what this checks -- no company relationship involved at all,
// unlike requireAdmin() in the per-company admin area.
async function requirePlatformAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError("NOT_SIGNED_IN", "Not signed in");

  const { data: admin } = await supabase
    .from("platform_admins")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!admin) {
    throw new AppError("PLATFORM_ADMIN_REQUIRED", "Platform admin access required");
  }
}

export type SubscriberEntry = {
  id: string;
  name: string;
  planName: string | null;
  subscriptionStatus: string;
  staffCount: number;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
};

export async function listSubscribers(): Promise<ActionResult<SubscriberEntry[]>> {
  try {
    await requirePlatformAdmin();

    // Cross-company reads need the service role -- companies/staff RLS
    // only grants a company's own staff access to their own company,
    // nothing broader, and platform admins aren't staff of anyone.
    const serviceClient = createServiceClient();
    const { data: companies, error } = await serviceClient
      .from("companies")
      .select(
        "id, name, subscription_status, trial_ends_at, suspended_at, created_at, plans(name)"
      )
      .neq("id", GLOBAL_COMPANY_ID)
      .order("created_at", { ascending: false });

    if (error) throw new AppError("DB_ERROR", error.message);

    const entries = await Promise.all(
      (companies ?? []).map(async (row) => {
        const { count } = await serviceClient
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("company_id", row.id);

        const plan = row.plans as { name: string } | null;

        return {
          id: row.id,
          name: row.name,
          planName: plan?.name ?? null,
          subscriptionStatus: row.subscription_status,
          staffCount: count ?? 0,
          trialEndsAt: row.trial_ends_at,
          suspendedAt: row.suspended_at,
          createdAt: row.created_at,
        };
      })
    );

    return ok(entries);
  } catch (e) {
    return err(e);
  }
}

export async function suspendCompany(companyId: string): Promise<ActionResult<null>> {
  try {
    await requirePlatformAdmin();
    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("companies")
      .update({ suspended_at: new Date().toISOString() })
      .eq("id", companyId);
    if (error) throw new AppError("DB_ERROR", error.message);
    return ok(null);
  } catch (e) {
    return err(e);
  }
}

export async function reactivateCompany(companyId: string): Promise<ActionResult<null>> {
  try {
    await requirePlatformAdmin();
    const serviceClient = createServiceClient();
    const { error } = await serviceClient
      .from("companies")
      .update({ suspended_at: null })
      .eq("id", companyId);
    if (error) throw new AppError("DB_ERROR", error.message);
    return ok(null);
  } catch (e) {
    return err(e);
  }
}
