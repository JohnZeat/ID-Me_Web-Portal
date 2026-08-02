"use server";

import { createClient } from "@/lib/supabase/server";

export type CustomerSearchResult = {
  id: string;
  full_name: string;
  dob: string;
  mobile_number: string;
};

export type GeneratedCode = {
  id: string;
  code: string;
  expires_at: string;
};

export async function searchCustomers(query: {
  fullName?: string;
  dob?: string;
  mobileNumber?: string;
}): Promise<CustomerSearchResult[]> {
  const fullName = query.fullName?.trim();
  const dob = query.dob?.trim();
  const mobileNumber = query.mobileNumber?.trim();

  if (!fullName && !dob && !mobileNumber) {
    return [];
  }

  const supabase = await createClient();
  let builder = supabase.from("customers").select("id, full_name, dob, mobile_number");

  if (fullName) builder = builder.ilike("full_name", `%${fullName}%`);
  if (dob) builder = builder.eq("dob", dob);
  if (mobileNumber) builder = builder.ilike("mobile_number", `%${mobileNumber}%`);

  const { data, error } = await builder.limit(10);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCustomer(input: {
  fullName: string;
  dob: string;
  mobileNumber: string;
}): Promise<CustomerSearchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not signed in");

  const { data: staff } = await supabase
    .from("staff")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!staff) throw new Error("Your account isn't provisioned for a company");

  const { data, error } = await supabase
    .from("customers")
    .insert({
      company_id: staff.company_id,
      full_name: input.fullName,
      dob: input.dob,
      mobile_number: input.mobileNumber,
    })
    .select("id, full_name, dob, mobile_number")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function generateCode(customerId: string): Promise<GeneratedCode> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("generate_customer_code", {
    p_customer_id: customerId,
  });

  if (error) throw new Error(error.message);
  return data as GeneratedCode;
}
