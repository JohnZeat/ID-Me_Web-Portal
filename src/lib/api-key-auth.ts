import { createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

const KEY_PREFIX = "idme_live_";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

// Only the hash is ever stored -- rawKey is returned once, at creation,
// and is not recoverable afterward. keyPrefix (a short, non-secret slice)
// is stored separately so the UI can show "which key is which" without
// re-displaying the secret.
export function generateApiKey(): {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const secret = randomBytes(24).toString("hex");
  const rawKey = `${KEY_PREFIX}${secret}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 8),
  };
}

// For API routes accepting a company's own systems (CRM, POS) calling in
// directly, authenticated via "Authorization: Bearer idme_live_...".
export async function authenticateApiKey(
  request: Request
): Promise<{ companyId: string; apiKeyId: string } | null> {
  const authHeader = request.headers.get("authorization");
  const rawKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!rawKey) return null;

  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from("api_keys")
    .select("id, company_id, revoked_at")
    .eq("key_hash", hashApiKey(rawKey))
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  // Best-effort usage tracking -- don't block the request on it.
  void serviceClient
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return { companyId: data.company_id, apiKeyId: data.id };
}
