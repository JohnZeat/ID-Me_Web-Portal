"use server";

import { getErrorGuidanceForStaff, type ErrorGuidance } from "@/lib/error-guidance";

export async function resolveErrorGuidance(code: string): Promise<ErrorGuidance | null> {
  return getErrorGuidanceForStaff(code);
}
