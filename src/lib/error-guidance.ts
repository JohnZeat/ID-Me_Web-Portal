import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const GLOBAL_COMPANY_ID = "00000000-0000-0000-0000-000000000000";

export type ErrorGuidance = { title: string; html: string };

// For authenticated staff/admin contexts -- resolves guidance scoped to
// the signed-in user's own company, falling back to the Global default.
export async function getErrorGuidanceForStaff(
  code: string
): Promise<ErrorGuidance | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let companyId: string | null = null;
  if (user) {
    const { data: staff } = await supabase
      .from("staff")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    companyId = staff?.company_id ?? null;
  }

  if (companyId) {
    const { data } = await supabase
      .from("error_messages")
      .select("title, guidance_html")
      .eq("company_id", companyId)
      .eq("error_code", code)
      .maybeSingle();
    if (data) return { title: data.title, html: data.guidance_html };
  }

  const { data: globalData } = await supabase
    .from("error_messages")
    .select("title, guidance_html")
    .eq("company_id", GLOBAL_COMPANY_ID)
    .eq("error_code", code)
    .maybeSingle();

  return globalData ? { title: globalData.title, html: globalData.guidance_html } : null;
}

// For the public verify-code endpoint -- no staff session, so there's no
// company to scope to; only the Global default can apply.
export async function getErrorGuidanceGlobal(
  code: string
): Promise<ErrorGuidance | null> {
  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from("error_messages")
    .select("title, guidance_html")
    .eq("company_id", GLOBAL_COMPANY_ID)
    .eq("error_code", code)
    .maybeSingle();

  return data ? { title: data.title, html: data.guidance_html } : null;
}
