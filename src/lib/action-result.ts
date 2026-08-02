// Next.js redacts thrown Server Action errors in production regardless of
// message content -- so actions return this instead of throwing, letting
// the UI show the real message without needing to check server logs.
//
// `code` is a stable identifier (e.g. "DOMAIN_NOT_REGISTERED") used to look
// up guidance HTML in the error_messages table via getErrorGuidance();
// `message` is the plain-text fallback shown if no matrix entry exists yet.
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, code: error.code, message: error.message };
  }
  return {
    ok: false,
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Something went wrong",
  };
}

// Throw this instead of a plain Error when the failure is an expected,
// named condition (validation, authorization, not-found) that should be
// looked up in the error_messages matrix. Plain Errors/unexpected
// exceptions still work via err() above, just fall back to code "UNKNOWN".
export class AppError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
