"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ok, err, AppError, type ActionResult } from "@/lib/action-result";
import { DATE_FORMATS, type DateFormat } from "@/lib/format-date";

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

  return staff;
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

    return ok({ upserted: count ?? validRows.length, skipped });
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

    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(staffId);
    if (deleteError) throw new AppError("DB_ERROR", deleteError.message);

    return ok(null);
  } catch (e) {
    return err(e);
  }
}

export async function inviteStaff(input: {
  email: string;
  fullName: string;
  role: "staff" | "admin";
}): Promise<ActionResult<{ email: string }>> {
  try {
    const staff = await requireAdmin();

    const fullName = input.fullName.trim();
    if (!fullName) throw new AppError("INVALID_FULL_NAME", "Full name can't be empty");

    const email = input.email.trim().toLowerCase();
    const domain = email.split("@")[1];
    if (!domain) throw new AppError("INVALID_EMAIL", "Invalid email address");

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

    const headersList = await headers();
    const host = headersList.get("host");
    const protocol = host?.startsWith("localhost") ? "http" : "https";
    const redirectTo = `${protocol}://${host}/invite/accept`;

    const serviceClient = createServiceClient();
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

    return ok({ email });
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
    return ok(data);
  } catch (e) {
    return err(e);
  }
}

export async function removeCompanyDomain(domainId: string): Promise<ActionResult<null>> {
  try {
    const staff = await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase
      .from("company_domains")
      .delete()
      .eq("id", domainId)
      .eq("company_id", staff.company_id);

    if (error) throw new AppError("DB_ERROR", error.message);
    return ok(null);
  } catch (e) {
    return err(e);
  }
}
