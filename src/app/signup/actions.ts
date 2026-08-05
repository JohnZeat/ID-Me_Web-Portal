"use server";

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, AppError, type ActionResult } from "@/lib/action-result";
import { createCheckoutSession } from "@/lib/stripe";

// Company/staff rows are NOT created here -- only once Stripe confirms
// payment via the checkout.session.completed webhook. This prevents an
// abandoned checkout from leaving a paid-for-nothing company behind.
// The auth account IS created up front (pre-confirmed) so login works
// the moment the webhook finishes provisioning, without a separate
// email-confirmation step blocking a paying customer.
export async function startSignup(input: {
  companyName: string;
  fullName: string;
  email: string;
  password: string;
  seats: number;
}): Promise<ActionResult<{ checkoutUrl: string }>> {
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

    const seats = Math.max(1, Math.trunc(input.seats) || 1);

    const serviceClient = createServiceClient();

    const { data: plan, error: planError } = await serviceClient
      .from("plans")
      .select("id, stripe_price_id")
      .eq("name", "Per-Seat")
      .maybeSingle();

    if (planError || !plan?.stripe_price_id) {
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

    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    const origin = `${protocol}://${host}`;

    try {
      const session = await createCheckoutSession({
        priceId: plan.stripe_price_id,
        quantity: seats,
        customerEmail: email,
        successUrl: `${origin}/signup/success`,
        cancelUrl: `${origin}/signup`,
        metadata: {
          auth_user_id: created.user.id,
          company_name: companyName,
          admin_full_name: fullName,
          plan_id: plan.id,
        },
      });

      return ok({ checkoutUrl: session.url });
    } catch (checkoutError) {
      // Roll back the auth account if Checkout Session creation fails,
      // so this email isn't stuck "already registered" with no company.
      await serviceClient.auth.admin.deleteUser(created.user.id);
      throw checkoutError;
    }
  } catch (e) {
    return err(e);
  }
}
