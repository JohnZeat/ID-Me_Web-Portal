"use server";

import { createClient } from "@/lib/supabase/server";

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

export async function uploadCustomersCsv(
  formData: FormData
): Promise<CsvUploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file provided");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: staff } = await supabase
    .from("staff")
    .select("company_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!staff) throw new Error("Your account isn't provisioned for a company");
  if (staff.role !== "admin") throw new Error("Admin role required");

  const rows = parseCsv(await file.text());
  if (rows.length === 0) {
    return { upserted: 0, skipped: [] };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf("full_name");
  const dobIdx = header.indexOf("dob");
  const mobileIdx = header.indexOf("mobile_number");
  const metadataIdx = header.indexOf("metadata");

  if (nameIdx === -1 || dobIdx === -1 || mobileIdx === -1) {
    throw new Error("CSV must have full_name, dob, and mobile_number columns");
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
    return { upserted: 0, skipped };
  }

  const { error, count } = await supabase
    .from("customers")
    .upsert(validRows, { onConflict: "company_id,full_name,dob", count: "exact" });

  if (error) {
    throw new Error(error.message);
  }

  return { upserted: count ?? validRows.length, skipped };
}
