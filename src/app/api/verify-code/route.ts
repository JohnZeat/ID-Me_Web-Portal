import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getErrorGuidanceGlobal } from "@/lib/error-guidance";

type VerifyRequestBody = {
  code?: unknown;
  mobileNumber?: unknown;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// No staff session exists at this endpoint, so failures can only resolve
// Global guidance -- there's no company to scope to until a code actually
// matches (and even then, revealing which company almost matched would
// leak information, so failures stay Global-only by design).
//
// Exception: NO_MATCH's guidance_html carries a {{expiry}} placeholder,
// substituted here with the actual matched customer's company's
// configured expiry when expirySeconds is provided.
async function failure(code: string, status: number, expirySeconds?: number) {
  const guidance = await getErrorGuidanceGlobal(code);
  const html =
    guidance && expirySeconds !== undefined
      ? guidance.html.replaceAll("{{expiry}}", formatDuration(expirySeconds))
      : guidance?.html;

  return NextResponse.json(
    { valid: false, code, guidance: guidance ? { ...guidance, html } : null },
    { status }
  );
}

/**
 * Public endpoint for the customer app: verifies a staff-generated code
 * against the customer's mobile number. Requires both to match -- a bare
 * 6-digit code alone is too guessable to trust on its own. No rate
 * limiting yet (README hardening step, deferred).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VerifyRequestBody | null;

  const codeInput = typeof body?.code === "string" ? body.code.trim() : "";
  const mobileNumber =
    typeof body?.mobileNumber === "string" ? body.mobileNumber.trim() : "";

  if (!/^\d{6}$/.test(codeInput) || !mobileNumber) {
    return failure("INVALID_REQUEST", 400);
  }

  const supabase = createServiceClient();

  const { data: codeRow, error } = await supabase
    .from("codes")
    .select("id, customer:customers(full_name, mobile_number)")
    .eq("code", codeInput)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return failure("SERVER_ERROR", 500);
  }

  const customer = codeRow?.customer as
    | { full_name: string; mobile_number: string }
    | null
    | undefined;

  if (!codeRow || !customer || customer.mobile_number !== mobileNumber) {
    // Best-effort: look up the expiry for whichever company this mobile
    // number actually belongs to, purely to make the message accurate --
    // doesn't affect whether verification succeeds either way.
    const { data: matchedCustomer } = await supabase
      .from("customers")
      .select("company_id")
      .eq("mobile_number", mobileNumber)
      .limit(1)
      .maybeSingle();

    let expirySeconds: number | undefined;
    if (matchedCustomer) {
      const { data: company } = await supabase
        .from("companies")
        .select("code_expiry_seconds")
        .eq("id", matchedCustomer.company_id)
        .maybeSingle();
      expirySeconds = company?.code_expiry_seconds;
    }

    return failure("NO_MATCH", 200, expirySeconds);
  }

  await supabase
    .from("codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", codeRow.id);

  return NextResponse.json({
    valid: true,
    customer: { fullName: customer.full_name },
  });
}
