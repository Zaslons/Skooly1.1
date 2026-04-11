/**
 * E0 reconciliation: shared conventions for scheduling-related errors.
 *
 * - **REST routes** under `/api/schools/...` should return JSON:
 *   `{ code: string, error: string, fieldErrors?: Record<string, string[]> }`
 *   with appropriate HTTP status (400, 403, 404, …).
 *
 * - **Server actions** (`'use server'`) should prefer:
 *   `{ success: true, message?: string, ...payload }` or
 *   `{ success: false, code: string, message: string, fieldErrors?: ... }`
 *
 * Legacy actions may still return `{ success, message }` without `code`; migrate opportunistically.
 */

export type SchedulingActionFailure = {
  success: false;
  code: string;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type SchedulingActionSuccess = {
  success: true;
  message?: string;
  [key: string]: unknown;
};

export type SchedulingActionResult = SchedulingActionSuccess | SchedulingActionFailure;

export function schedulingActionFailure(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[] | undefined>
): SchedulingActionFailure {
  return { success: false, code, message, fieldErrors };
}
