import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyStripeWebhookSignature } from "@/lib/stripe";

type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "incomplete";
  }
}

/**
 * Stripe webhook. Company/staff provisioning happens ONLY here, on
 * checkout.session.completed -- not at Checkout Session creation --
 * so an abandoned checkout never leaves a half-created company behind.
 * Signature verified manually (HMAC via node:crypto) rather than via
 * the Stripe SDK, since there's no way to safely add an npm dependency
 * here (no local Node/npm to regenerate the lockfile).
 */
export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 }
    );
  }

  if (!verifyStripeWebhookSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload);
  const supabase = createServiceClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata ?? {};
    const authUserId = metadata.auth_user_id as string | undefined;
    const companyName = metadata.company_name as string | undefined;
    const adminFullName = metadata.admin_full_name as string | undefined;
    const planId = metadata.plan_id as string | undefined;

    if (authUserId && companyName && planId) {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          name: companyName,
          plan_id: planId,
          subscription_status: "active",
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        })
        .select("id")
        .single();

      if (!companyError && company) {
        await supabase.from("staff").insert({
          id: authUserId,
          company_id: company.id,
          role: "admin",
          full_name: adminFullName ?? null,
        });
      }
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object;
    await supabase
      .from("companies")
      .update({ subscription_status: mapStripeStatus(subscription.status) })
      .eq("stripe_subscription_id", subscription.id);
  }

  return NextResponse.json({ received: true });
}
