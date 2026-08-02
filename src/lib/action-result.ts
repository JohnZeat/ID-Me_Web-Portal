// Next.js redacts thrown Server Action errors in production regardless of
// message content -- so actions return this instead of throwing, letting
// the UI show the real message without needing to check server logs.
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(error: unknown): ActionResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong" };
}
