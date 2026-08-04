import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { createServiceClient } from "@/lib/supabase/service";

const MOBILE_REGEX = /^\+[1-9]\d{1,14}$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type SyncCustomer = {
  fullName?: unknown;
  dob?: unknown;
  mobileNumber?: unknown;
  metadata?: unknown;
};

type SkipReason = { index: number; reason: string };

/**
 * API-key-authenticated endpoint for a company's own systems (CRM, POS)
 * to sync their customer list programmatically, instead of the CSV
 * upload in /admin. Body: { customers: [{ fullName, dob, mobileNumber,
 * metadata? }, ...] }. Same upsert-on-(company,fullName,dob) semantics
 * and per-row skip-and-report as the CSV path -- one bad row doesn't
 * fail the whole batch.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const customers = Array.isArray(body?.customers)
    ? (body.customers as SyncCustomer[])
    : null;
  if (!customers) {
    return NextResponse.json(
      { error: "Body must be { customers: [...] }" },
      { status: 400 }
    );
  }

  const skipped: SkipReason[] = [];
  const validRows: {
    company_id: string;
    full_name: string;
    dob: string;
    mobile_number: string;
    metadata: object;
  }[] = [];

  customers.forEach((c, index) => {
    const fullName = typeof c.fullName === "string" ? c.fullName.trim() : "";
    const dob = typeof c.dob === "string" ? c.dob.trim() : "";
    const mobileNumber = typeof c.mobileNumber === "string" ? c.mobileNumber.trim() : "";
    const metadata = typeof c.metadata === "object" && c.metadata !== null ? c.metadata : {};

    if (!fullName) {
      skipped.push({ index, reason: "Missing fullName" });
      return;
    }
    if (!dob || !DOB_REGEX.test(dob) || Number.isNaN(new Date(dob).getTime())) {
      skipped.push({ index, reason: "Invalid dob (expected YYYY-MM-DD)" });
      return;
    }
    if (!mobileNumber || !MOBILE_REGEX.test(mobileNumber)) {
      skipped.push({
        index,
        reason: "Invalid mobileNumber (expected E.164, e.g. +61412345678)",
      });
      return;
    }

    validRows.push({
      company_id: auth.companyId,
      full_name: fullName,
      dob,
      mobile_number: mobileNumber,
      metadata,
    });
  });

  if (validRows.length === 0) {
    return NextResponse.json({ synced: 0, skipped });
  }

  const supabase = createServiceClient();
  const { error, count } = await supabase
    .from("customers")
    .upsert(validRows, { onConflict: "company_id,full_name,dob", count: "exact" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: count ?? validRows.length, skipped });
}
