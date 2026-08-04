import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (browser).
 * Reads publishable env vars — safe to expose to the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Handled explicitly in /invite/accept instead -- the implicit
        // auto-detection can skip processing invite/recovery tokens
        // entirely when a session already exists (e.g. an admin testing
        // an invite in the same browser they're signed in on), silently
        // acting on the wrong account instead of the invited one.
        detectSessionInUrl: false,
      },
    }
  );
}
