/**
 * Parent-link codes are meant for onboarding a guardian when no registered contact exists yet.
 * If either the Parent profile or linked Auth has a non-empty email, accepting a link would
 * orphan the existing account's relationship to the student.
 */
export function hasRegisteredParentContact(params: {
  parentEmail: string | null | undefined;
  authEmail: string | null | undefined;
}): boolean {
  const p = params.parentEmail?.trim();
  const a = params.authEmail?.trim();
  return Boolean(p || a);
}
