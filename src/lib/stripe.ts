import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return key;
}

// Stripe's API is form-encoded with bracket notation for nested values
// (e.g. line_items[0][price]=..., metadata[foo]=...) -- flattens
// arbitrarily nested objects/arrays into that format.
function appendFormParams(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendFormParams(params, `${key}[${i}]`, v));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      appendFormParams(params, `${key}[${k}]`, v);
    }
  } else {
    params.append(key, String(value));
  }
}

function buildFormBody(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    appendFormParams(params, key, value);
  }
  return params.toString();
}

async function stripeRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" && body ? buildFormBody(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe API error (${res.status})`);
  }
  return data as T;
}

export async function createCheckoutSession(input: {
  priceId: string;
  quantity: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  return stripeRequest("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: input.quantity }],
    customer_email: input.customerEmail,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: input.metadata,
  });
}

// Stripe's own hosted UI for invoice history, payment method updates,
// and cancellation -- no reason to build that ourselves.
export async function createBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  return stripeRequest("POST", "/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

// Volume-priced subscriptions have exactly one item; updates its
// quantity to match the company's actual current staff count.
export async function updateSubscriptionQuantity(
  subscriptionId: string,
  quantity: number
): Promise<void> {
  const sub = await stripeRequest<{ items: { data: { id: string }[] } }>(
    "GET",
    `/subscriptions/${subscriptionId}`
  );
  const itemId = sub.items.data[0]?.id;
  if (!itemId) throw new Error("Subscription has no items");

  await stripeRequest("POST", `/subscription_items/${itemId}`, { quantity });
}

// Schedules cancellation for the end of the current billing period
// (rather than an immediate DELETE) so the company keeps access
// through what they've already paid for -- standard self-serve SaaS
// behavior. cancel_at_period_end: false undoes a pending cancellation.
export async function setSubscriptionCancelAtPeriodEnd(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
): Promise<void> {
  await stripeRequest("POST", `/subscriptions/${subscriptionId}`, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
}

// HMAC verification per Stripe's documented scheme -- avoids pulling in
// the Stripe SDK just for this one function (no Node/npm available
// locally to safely regenerate the lockfile for a new dependency).
export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => part.split("=") as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > toleranceSeconds) return false;

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;

  return timingSafeEqual(expectedBuf, signatureBuf);
}
