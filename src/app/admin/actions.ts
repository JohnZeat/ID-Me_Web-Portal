"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, AppError, type ActionResult } from "@/lib/action-result";
import { DATE_FORMATS, type DateFormat } from "@/lib/format-date";
import { generateApiKey } from "@/lib/api-key-auth";
import { updateSubscriptionQuantity } from "@/lib/stripe";
import { isTrialExpired } from "@/lib/subscription";

export type SkipReason = { row: number; reason: string };

export type CsvUploadResult = {
  upserted: number;
  skipped: SkipReason[];
};

const MOBILE_REGEX = /^\+[1-9]\d{1,14}$/;
const DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Minimal RFC4180-style parser: handles quoted fields with embedded
// commas and doubled-quote escaping. Assumes no embedded newlines
// within a field, which matches how this app's own metadata JSON is
// generated (no newlines) -- fine for the CSVs this feature expects.
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): string[][] {
  return text
    .split(/\r\n|\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

// Checks the caller is an authenticated company admin, throwing if not.
// Returns their staff row so callers don't need a second lookup. Callers
// (all exported actions below) catch this within their own try/catch and
// convert it to an ActionResult -- Next.js redacts thrown Server Action
// errors in production, so nothing should throw past an action boundary.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AppError("NOT_SIGNED_IN", "Not signed in");

  const { data: staff } = await supabase
    .from("staff")
    .select("id, company_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!staff) {
    throw new AppError("NOT_PROVISIONED", "Your account isn't provisioned for a company");
  }
  if (staff.role !== "admin") throw new AppError("ADMIN_REQUIRED", "Admin role required");

  const { data: company } = await supabase
    .from("companies")
    .select("subscription_status, trial_ends_at")
    .eq("id", staff.company_id)
    .maybeSingle();

  if (company && isTrialExpired(company)) {
    throw new AppError(
      "TRIAL_EXPIRED",
      "Your free trial has ended. Subscribe to continue using the admin area."
    );
  }

  return staff;
}

// Best-effort: a logging hiccup shouldn't fail the action that
// triggered it, so failures here are swallowed (not surfaced via err()).
async function logAuditEvent(
  companyId: string,
  actorId: string,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("audit_log")
      .insert({ company_id: companyId, actor_id: actorId, action, details });
  } catch {
    // Swallowed intentionally -- see comment above.
  }
}

// Best-effort, same reasoning as logAuditEvent: keeps a company's
// Stripe subscription quantity matching their actual staff count.
// No-ops for companies with no subscription yet (e.g. ones created
// manually before self-serve signup existed, like the early test
// companies).
async function syncSeatCount(companyId: string): Promise<void> {
  try {
    const serviceClient = createServiceClient();
    const { data: company } = await serviceClient
      .from("companies")
      .select("stripe_subscription_id")
      .eq("id", companyId)
      .maybeSingle();

    if (!company?.stripe_subscription_id) return;

    const { count } = await serviceClient
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    await updateSubscriptionQuantity(company.stripe_subscription_id, count ?? 0);
  } catch {
    // Swallowed intentionally -- see comment above.
  }
}

export async function uploadCustomersCsv(
  formData: FormData
): Promise<ActionResult<CsvUploadResult>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("NO_FILE", "No file provided");
    }

    const staff = await requireAdmin();
    const supabase = await createClient();

    const rows = parseCsv(await file.text());
    if (rows.length === 0) {
      return ok({ upserted: 0, skipped: [] });
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf("full_name");
    const dobIdx = header.indexOf("dob");
    const mobileIdx = header.indexOf("mobile_number");
    const metadataIdx = header.indexOf("metadata");

    if (nameIdx === -1 || dobIdx === -1 || mobileIdx === -1) {
      throw new AppError(
        "CSV_INVALID_HEADERS",
        "CSV must have full_name, dob, and mobile_number columns"
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

    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1; // 1-based, header is row 1
      const cols = rows[i];
      const fullName = cols[nameIdx]?.trim();
      const dob = cols[dobIdx]?.trim();
      const mobileNumber = cols[mobileIdx]?.trim();
      const metadataRaw = metadataIdx !== -1 ? cols[metadataIdx]?.trim() : "";

      if (!fullName) {
        skipped.push({ row: rowNumber, reason: "Missing full_name" });
        continue;
      }
      if (!dob || !DOB_REGEX.test(dob) || Number.isNaN(new Date(dob).getTime())) {
        skipped.push({ row: rowNumber, reason: "Invalid dob (expected YYYY-MM-DD)" });
        continue;
      }
      if (!mobileNumber || !MOBILE_REGEX.test(mobileNumber)) {
        skipped.push({
          row: rowNumber,
          reason: "Invalid mobile_number (expected E.164, e.g. +61412345678)",
        });
        continue;
      }

      let metadata: object = {};
      if (metadataRaw) {
        try {
          metadata = JSON.parse(metadataRaw);
        } catch {
          skipped.push({ row: rowNumber, reason: "metadata is not valid JSON" });
          continue;
        }
      }

      validRows.push({
        company_id: staff.company_id,
        full_name: fullName,
        dob,
        mobile_number: mobileNumber,
        metadata,
      });
    }

    if (validRows.length === 0) {
      return ok({ upserted: 0, skipped });
    }

    const { error, count } = await supabase
      .from("customers")
      .upsert(validRows, { onConflict: "company_id,full_name,dob", count: "exact" });

    if (error) {
      throw new AppError("DB_ERROR", error.message);
    }

    const upserted = count ?? validRows.length;
    await logAuditEvent(staff.company_id, staff.id, "CUSTOMERS_CSV_UPLOADED", {
      upserted,
      skippedCount: skipped.length,
    });

    return ok({ upserted, skipped });
  } catch (e) {
    return err(e);
  }
}

export type CustomerEntry = {
  id: string;
  fullName: string;
  dob: string;
  mobileNumber: string;
};

export type CustomerPage = {
  customers: CustomerEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listCustomers(input: {
  search?: string;
  page: number;
  pageSize: number;
}): Promise<ActionResult<CustomerPage>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();

    const page = Math.max(1, Math.trunc(input.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize) || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("customers")
      .select("id, full_name, dob, mobile_number", { count: "exact" })
      .eq("company_id", staff.company_id)
      .order("full_name");

    // Commas are the .or() filter's own separator syntax -- strip them
    // from user input so a name/search containing one can't break the
    // query instead of just failing to match.
    const search = input.search?.trim().replace(/,/g, "");
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,mobile_number.ilike.%${search}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) throw new AppError("DB_ERROR", error.message);

    return ok({
      customers: (data ?? []).map((row) => ({
        id: row.id,
        fullName: row.full_name,
        dob: row.dob,
        mobileNumber: row.mobile_number,
      })),
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    return err(e);
  }
}

export type StaffListEntry = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
};

export async function listStaff(): Promise<ActionResult<StaffListEntry[]>> {
  try {
    const staff = await requireAdmin();

    // staff has no select policy for viewing teammates (only "own row"),
    // and auth.users (for email) isn't reachable via the regular client
    // at all -- both require the service role, gated by the admin check
    // above rather than by RLS.
    const serviceClient = createServiceClient();
    const { data: companyStaff, error } = await serviceClient
      .from("staff")
      .select("id, role, full_name")
      .eq("company_id", staff.company_id);

    if (error) throw new AppError("DB_ERROR", error.message);

    const list = await Promise.all(
      (companyStaff ?? []).map(async (row) => {
        const { data } = await serviceClient.auth.admin.getUserById(row.id);
        return {
          id: row.id,
          email: data.user?.email ?? "(unknown)",
          fullName: row.full_name,
          role: row.role,
        };
      })
    );

    return ok(list);
  } catch (e) {
    return err(e);
  }
}

// Deletes the auth.users row via the Admin API; staff.id references
// auth.users(id) on delete cascade, so the staff row is removed
// automatically. codes.created_by is ON DELETE SET NULL, so past
// generated codes are preserved with the creator reference cleared.
export async function offboardStaff(staffId: string): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();

    if (staffId === staff.id) {
      throw new AppError("CANNOT_REMOVE_SELF", "You can't remove your own staff account");
    }

    const serviceClient = createServiceClient();

    const { data: target, error: targetError } = await serviceClient
      .from("staff")
      .select("company_id, role")
      .eq("id", staffId)
      .maybeSingle();

    if (targetError) throw new AppError("DB_ERROR", targetError.message);
    if (!target || target.company_id !== staff.company_id) {
      throw new AppError("STAFF_NOT_FOUND", "That staff member wasn't found in your company");
    }

    if (target.role === "admin") {
      const { count, error: countError } = await serviceClient
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("company_id", staff.company_id)
        .eq("role", "admin");
      if (countError) throw new AppError("DB_ERROR", countError.message);
      if ((count ?? 0) <= 1) {
        throw new AppError(
          "LAST_ADMIN",
          "Can't remove the last admin -- promote another staff member to admin first"
        );
      }
    }

    // Capture identifying info before deletion -- auth.users is gone
    // afterward, so there's nothing left to look up for the log.
    const { data: targetUser } = await serviceClient.auth.admin.getUserById(staffId);
    const targetEmail = targetUser.user?.email ?? "(unknown)";

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(staffId);
    if (deleteError) throw new AppError("DB_ERROR", deleteError.message);

    await logAuditEvent(staff.company_id, staff.id, "STAFF_REMOVED", {
      email: targetEmail,
      role: target.role,
    });
    await syncSeatCount(staff.company_id);

    return ok(null);
  } catch (e) {
    return err(e);
  }
}

type AdminStaff = { id: string; company_id: string; role: string };

// Shared core used by both the single-invite form and the bulk CSV
// upload: validates the domain, sends the Supabase invite, and creates
// the staff row. Throws AppError on failure -- callers decide whether
// that aborts the whole request (single invite) or just skips this row
// and continues (bulk upload).
async function inviteOneStaffMember(
  staff: AdminStaff,
  redirectTo: string,
  input: { email: string; fullName: string; role: "staff" | "admin" }
): Promise<{ email: string }> {
  const fullName = input.fullName.trim();
  if (!fullName) throw new AppError("INVALID_FULL_NAME", "Full name can't be empty");

  const email = input.email.trim().toLowerCase();
  const domain = email.split("@")[1];
  if (!domain) throw new AppError("INVALID_EMAIL", "Invalid email address");

  const serviceClient = createServiceClient();

  // Trial companies are capped at 1 seat (the founding admin) --
  // adding anyone else requires subscribing first. Checked before the
  // domain lookup since "can this company add anyone at all right
  // now" is the more fundamental gate.
  const { data: company } = await serviceClient
    .from("companies")
    .select("subscription_status")
    .eq("id", staff.company_id)
    .maybeSingle();

  if (company?.subscription_status === "trialing") {
    const { count } = await serviceClient
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("company_id", staff.company_id);

    if ((count ?? 0) >= 1) {
      throw new AppError(
        "TRIAL_SEAT_LIMIT",
        "Your free trial is limited to 1 seat. Subscribe to add more staff."
      );
    }
  }

  const supabase = await createClient();
  const { data: domainMatch } = await supabase
    .from("company_domains")
    .select("id")
    .eq("company_id", staff.company_id)
    .eq("domain", domain)
    .maybeSingle();

  if (!domainMatch) {
    throw new AppError(
      "DOMAIN_NOT_REGISTERED",
      `${domain} isn't a registered domain for your company. Add it before inviting this address.`
    );
  }

  const { data: invited, error } = await serviceClient.auth.admin.inviteUserByEmail(
    email,
    { redirectTo }
  );
  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new AppError("USER_ALREADY_EXISTS", error.message);
    }
    throw new AppError("DB_ERROR", error.message);
  }
  if (!invited.user) throw new AppError("INVITE_FAILED", "Invite failed");

  const { error: staffError } = await serviceClient.from("staff").insert({
    id: invited.user.id,
    company_id: staff.company_id,
    role: input.role,
    full_name: fullName,
  });
  if (staffError) throw new AppError("DB_ERROR", staffError.message);

  await logAuditEvent(staff.company_id, staff.id, "STAFF_INVITED", {
    email,
    fullName,
    role: input.role,
  });
  await syncSeatCount(staff.company_id);

  return { email };
}

async function inviteRedirectTo(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}/invite/accept`;
}

export async function inviteStaff(input: {
  email: string;
  fullName: string;
  role: "staff" | "admin";
}): Promise<ActionResult<{ email: string }>> {
  try {
    const staff = await requireAdmin();
    const redirectTo = await inviteRedirectTo();
    return ok(await inviteOneStaffMember(staff, redirectTo, input));
  } catch (e) {
    return err(e);
  }
}

export type StaffCsvUploadResult = {
  invited: number;
  skipped: SkipReason[];
};

export async function uploadStaffCsv(
  formData: FormData
): Promise<ActionResult<StaffCsvUploadResult>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("NO_FILE", "No file provided");
    }

    const staff = await requireAdmin();
    const redirectTo = await inviteRedirectTo();

    const rows = parseCsv(await file.text());
    if (rows.length === 0) {
      return ok({ invited: 0, skipped: [] });
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.indexOf("full_name");
    const emailIdx = header.indexOf("email");
    const roleIdx = header.indexOf("role");

    if (nameIdx === -1 || emailIdx === -1) {
      throw new AppError("CSV_INVALID_HEADERS", "CSV must have full_name and email columns");
    }

    const skipped: SkipReason[] = [];
    let invited = 0;

    for (let i = 1; i < rows.length; i++) {
      const rowNumber = i + 1; // 1-based, header is row 1
      const cols = rows[i];
      const fullName = cols[nameIdx]?.trim();
      const email = cols[emailIdx]?.trim();
      const roleRaw = (roleIdx !== -1 ? cols[roleIdx]?.trim() : undefined) ?? "";
      const role = roleRaw.toLowerCase() || "staff";

      if (!fullName || !email) {
        skipped.push({ row: rowNumber, reason: "Missing full_name or email" });
        continue;
      }
      if (role !== "staff" && role !== "admin") {
        skipped.push({
          row: rowNumber,
          reason: `Invalid role "${roleRaw}" (expected staff or admin)`,
        });
        continue;
      }

      try {
        await inviteOneStaffMember(staff, redirectTo, {
          email,
          fullName,
          role: role as "staff" | "admin",
        });
        invited++;
      } catch (e) {
        const reason = e instanceof AppError ? e.message : "Could not invite this address";
        skipped.push({ row: rowNumber, reason });
      }
    }

    await logAuditEvent(staff.company_id, staff.id, "STAFF_CSV_UPLOADED", {
      invited,
      skippedCount: skipped.length,
    });

    return ok({ invited, skipped });
  } catch (e) {
    return err(e);
  }
}

export type CompanySettings = {
  name: string;
  codeExpirySeconds: number;
  dateFormat: DateFormat;
};

// companies has a select policy letting staff view their own company, but
// no update policy for the regular client -- both use the service role
// here for consistency, gated by requireAdmin() either way.
export async function getCompanySettings(): Promise<ActionResult<CompanySettings>> {
  try {
    const staff = await requireAdmin();
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("companies")
      .select("name, code_expiry_seconds, date_format")
      .eq("id", staff.company_id)
      .single();

    if (error) throw new AppError("DB_ERROR", error.message);
    return ok({
      name: data.name,
      codeExpirySeconds: data.code_expiry_seconds,
      dateFormat: data.date_format,
    });
  } catch (e) {
    return err(e);
  }
}

export async function updateCompanySettings(input: {
  name: string;
  codeExpirySeconds: number;
  dateFormat: string;
}): Promise<ActionResult<CompanySettings>> {
  try {
    const staff = await requireAdmin();

    const name = input.name.trim();
    if (!name) throw new AppError("INVALID_COMPANY_NAME", "Company name can't be empty");

    const codeExpirySeconds = Math.trunc(input.codeExpirySeconds);
    if (
      !Number.isFinite(codeExpirySeconds) ||
      codeExpirySeconds <= 0 ||
      codeExpirySeconds > 3600
    ) {
      throw new AppError(
        "INVALID_CODE_EXPIRY",
        "Code expiry must be between 1 and 3600 seconds"
      );
    }

    if (!DATE_FORMATS.includes(input.dateFormat as DateFormat)) {
      throw new AppError("INVALID_DATE_FORMAT", "Unrecognized date format");
    }
    const dateFormat = input.dateFormat as DateFormat;

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from("companies")
      .update({ name, code_expiry_seconds: codeExpirySeconds, date_format: dateFormat })
      .eq("id", staff.company_id)
      .select("name, code_expiry_seconds, date_format")
      .single();

    if (error) throw new AppError("DB_ERROR", error.message);

    await logAuditEvent(staff.company_id, staff.id, "COMPANY_SETTINGS_UPDATED", {
      name: data.name,
      codeExpirySeconds: data.code_expiry_seconds,
      dateFormat: data.date_format,
    });

    return ok({
      name: data.name,
      codeExpirySeconds: data.code_expiry_seconds,
      dateFormat: data.date_format,
    });
  } catch (e) {
    return err(e);
  }
}

export type CompanyDomainEntry = { id: string; domain: string };

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// company_domains already has admin-scoped RLS policies (from the earlier
// staff-invite work), so these use the regular client directly.
export async function listCompanyDomains(): Promise<ActionResult<CompanyDomainEntry[]>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_domains")
      .select("id, domain")
      .eq("company_id", staff.company_id)
      .order("domain");

    if (error) throw new AppError("DB_ERROR", error.message);
    return ok(data ?? []);
  } catch (e) {
    return err(e);
  }
}

export async function addCompanyDomain(
  domainInput: string
): Promise<ActionResult<CompanyDomainEntry>> {
  try {
    const staff = await requireAdmin();
    const domain = domainInput.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(domain)) {
      throw new AppError(
        "INVALID_DOMAIN",
        "That doesn't look like a valid domain (e.g. company.com)"
      );
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_domains")
      .insert({ company_id: staff.company_id, domain })
      .select("id, domain")
      .single();

    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.code === "23505") {
        throw new AppError(
          "DOMAIN_ALREADY_REGISTERED",
          "That domain is already registered, to your company or another one"
        );
      }
      throw new AppError("DB_ERROR", error.message);
    }

    await logAuditEvent(staff.company_id, staff.id, "DOMAIN_ADDED", { domain });

    return ok(data);
  } catch (e) {
    return err(e);
  }
}

export async function removeCompanyDomain(domainId: string): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("company_domains")
      .delete()
      .eq("id", domainId)
      .eq("company_id", staff.company_id)
      .select("domain")
      .maybeSingle();

    if (error) throw new AppError("DB_ERROR", error.message);

    await logAuditEvent(staff.company_id, staff.id, "DOMAIN_REMOVED", {
      domain: data?.domain ?? "(unknown)",
    });

    return ok(null);
  } catch (e) {
    return err(e);
  }
}

export type ApiKeyEntry = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function toApiKeyEntry(row: {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}): ApiKeyEntry {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

// api_keys already has an admin-scoped RLS policy, so the regular
// client works directly here, same as company_domains.
export async function listApiKeys(): Promise<ActionResult<ApiKeyEntry[]>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .eq("company_id", staff.company_id)
      .order("created_at", { ascending: false });

    if (error) throw new AppError("DB_ERROR", error.message);
    return ok((data ?? []).map(toApiKeyEntry));
  } catch (e) {
    return err(e);
  }
}

export async function createApiKey(
  nameInput: string
): Promise<ActionResult<{ rawKey: string; entry: ApiKeyEntry }>> {
  try {
    const staff = await requireAdmin();
    const name = nameInput.trim();
    if (!name) throw new AppError("INVALID_API_KEY_NAME", "Name can't be empty");

    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        company_id: staff.company_id,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        created_by: staff.id,
      })
      .select("id, name, key_prefix, created_at, last_used_at, revoked_at")
      .single();

    if (error) throw new AppError("DB_ERROR", error.message);

    await logAuditEvent(staff.company_id, staff.id, "API_KEY_CREATED", {
      name,
      keyPrefix,
    });

    return ok({ rawKey, entry: toApiKeyEntry(data) });
  } catch (e) {
    return err(e);
  }
}

export async function revokeApiKey(id: string): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", staff.company_id)
      .select("name")
      .maybeSingle();

    if (error) throw new AppError("DB_ERROR", error.message);

    await logAuditEvent(staff.company_id, staff.id, "API_KEY_REVOKED", {
      name: data?.name ?? "(unknown)",
    });

    return ok(null);
  } catch (e) {
    return err(e);
  }
}

export type AuditLogEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  actorEmail: string | null;
  createdAt: string;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listAuditLog(input: {
  page: number;
  pageSize: number;
}): Promise<ActionResult<AuditLogPage>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();

    const page = Math.max(1, Math.trunc(input.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize) || 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from("audit_log")
      .select("id, actor_id, action, details, created_at", { count: "exact" })
      .eq("company_id", staff.company_id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new AppError("DB_ERROR", error.message);

    // auth.users (for actor email) isn't reachable from the regular
    // client, so this part needs the service role, same as listStaff.
    const serviceClient = createServiceClient();
    const entries = await Promise.all(
      (data ?? []).map(async (row) => {
        let actorEmail: string | null = null;
        if (row.actor_id) {
          const { data: userData } = await serviceClient.auth.admin.getUserById(row.actor_id);
          actorEmail = userData.user?.email ?? null;
        }
        return {
          id: row.id,
          action: row.action,
          details: (row.details ?? {}) as Record<string, unknown>,
          actorEmail,
          createdAt: row.created_at,
        };
      })
    );

    return ok({ entries, total: count ?? 0, page, pageSize });
  } catch (e) {
    return err(e);
  }
}
