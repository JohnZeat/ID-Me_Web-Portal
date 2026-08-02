import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type VerifyRequestBody = {
  code?: unknown;
  mobileNumber?: unknown;
};

/**
 * Public endpoint for the customer app: verifies a staff-generated code
 * against the customer's mobile number. Requires both to match -- a bare
 * 6-digit code alone is too guessable to trust on its own. No rate
 * limiting yet (README hardening step, deferred).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VerifyRequestBody | null;

  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const mobileNumber =
    typeof body?.mobileNumber === "string" ? body.mobileNumber.trim() : "";

  if (!/^\d{6}$/.test(code) || !mobileNumber) {
    return NextResponse.json(
      { valid: false, reason: "invalid_request" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data: codeRow, error } = await supabase
    .from("codes")
    .select("id, customer:customers(full_name, mobile_number)")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { valid: false, reason: "server_error" },
      { status: 500 }
    );
  }

  const customer = codeRow?.customer as
    | { full_name: string; mobile_number: string }
    | null
    | undefined;

  if (!codeRow || !customer || customer.mobile_number !== mobileNumber) {
    return NextResponse.json({ valid: false, reason: "no_match" });
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
