"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, AppError, type ActionResult } from "@/lib/action-result";

const TRIAL_DAYS = 28;

// Trial signup creates the company + admin staff row directly -- no
// Stripe involved at all, no waiting on a webhook. Converting to a
// paid subscription later ("Subscribe to Pro") is a separate flow
// that reuses the Stripe Checkout + webhook pattern from before,
// updating this same company row rather than creating a new one.
//
// Seat cap enforcement (trial limited to 1 seat) is a follow-up step,
// not yet wired in here.
export async function startTrialSignup(input: {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<ActionResult<null>> {
  try {
    const companyName = input.companyName.trim();
    if (!companyName) throw new AppError("INVALID_COMPANY_NAME", "Company name can't be empty");

    const fullName = input.fullName.trim();
    if (!fullName) throw new AppError("INVALID_FULL_NAME", "Full name can't be empty");

    const email = input.email.trim().toLowerCase();
    const domain = email.split("@")[1];
    if (!domain) throw new AppError("INVALID_EMAIL", "Invalid email address");

    if (input.password.length < 8) {
      throw new AppError("INVALID_PASSWORD", "Password must be at least 8 characters");
    }

    const serviceClient = createServiceClient();

    const { data: plan, error: planError } = await serviceClient
      .from("plans")
      .select("id")
      .eq("name", "Per-Seat")
      .maybeSingle();
    if (planError || !plan) {
      throw new AppError(
        "PLAN_NOT_CONFIGURED",
        "Billing isn't configured yet -- contact support"
      );
    }

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
    });
    if (createError) {
      if (createError.message.toLowerCase().includes("already")) {
        throw new AppError(
          "USER_ALREADY_EXISTS",
          "An account with that email already exists"
        );
      }
      throw new AppError("DB_ERROR", createError.message);
    }
    if (!created.user) throw new AppError("SIGNUP_FAILED", "Could not create account");

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: company, error: companyError } = await serviceClient
      .from("companies")
      .insert({
        name: companyName,
        plan_id: plan.id,
        subscription_status: "trialing",
        trial_ends_at: trialEndsAt,
      })
      .select("id")
      .single();

    if (companyError || !company) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      throw new AppError("DB_ERROR", companyError?.message ?? "Could not create company");
    }

    const { error: staffError } = await serviceClient.from("staff").insert({
      id: created.user.id,
      company_id: company.id,
      role: "admin",
      full_name: fullName,
    });

    if (staffError) {
      // Cleanup so this doesn't leave an orphaned, inaccessible company.
      await serviceClient.from("companies").delete().eq("id", company.id);
      await serviceClient.auth.admin.deleteUser(created.user.id);
      throw new AppError("DB_ERROR", staffError.message);
    }

    // Sign them in immediately -- they just set a password, no reason
    // to make them log in again right after signing up. If this
    // hiccups the account/company still exist fine either way; they
    // can just sign in manually.
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email, password: input.password });

    return ok(null);
  } catch (e) {
    return err(e);
  }
}
