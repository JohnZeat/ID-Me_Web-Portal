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
 * Stripe webhook. checkout.session.completed here always means an
 * existing trialing company converting to paid ("Subscribe to Pro") --
 * signup itself no longer goes through Stripe (companies start on a
 * free trial, created directly), so this only ever updates a company
 * row, never creates one. Signature verified manually (HMAC via
 * node:crypto) rather than via the Stripe SDK, since there's no way to
 * safely add an npm dependency here (no local Node/npm to regenerate
 * the lockfile).
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
    const companyId = session.metadata?.company_id as string | undefined;

    if (companyId) {
      await supabase
        .from("companies")
        .update({
          subscription_status: "active",
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
        })
        .eq("id", companyId);
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
