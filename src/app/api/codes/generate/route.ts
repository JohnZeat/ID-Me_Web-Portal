import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { createServiceClient } from "@/lib/supabase/service";

type GenerateBody = {
  customerId?: unknown;
  fullName?: unknown;
  dob?: unknown;
  mobileNumber?: unknown;
};

/**
 * API-key-authenticated endpoint for a company's own systems (CRM, POS)
 * to trigger code generation directly, instead of through the staff
 * dashboard. Identify the customer by customerId, or fullName+dob, or
 * mobileNumber. Reuses generate_customer_code() (2FA-style 6-digit code,
 * company-configured expiry, supersedes any still-active code).
 */
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as GenerateBody | null;
  const supabase = createServiceClient();

  let customerId = typeof body?.customerId === "string" ? body.customerId : null;

  if (customerId) {
    // The service role bypasses RLS, so an explicit customerId must be
    // checked against this API key's own company here -- otherwise any
    // key could generate codes for any company's customers.
    const { data: owned } = await supabase
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("company_id", auth.companyId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
  } else {
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
    const dob = typeof body?.dob === "string" ? body.dob.trim() : "";
    const mobileNumber =
      typeof body?.mobileNumber === "string" ? body.mobileNumber.trim() : "";

    let query = supabase.from("customers").select("id").eq("company_id", auth.companyId);

    if (fullName && dob) {
      query = query.eq("full_name", fullName).eq("dob", dob);
    } else if (mobileNumber) {
      query = query.eq("mobile_number", mobileNumber);
    } else {
      return NextResponse.json(
        { error: "Provide customerId, or fullName+dob, or mobileNumber" },
        { status: 400 }
      );
    }

    const { data: match } = await query.maybeSingle();
    if (!match) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    customerId = match.id;
  }

  const { data, error } = await supabase.rpc("generate_customer_code", {
    p_customer_id: customerId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code: data.code, expiresAt: data.expires_at });
}
