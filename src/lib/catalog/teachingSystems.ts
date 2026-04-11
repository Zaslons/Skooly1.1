/** Normalized slugs for School.teachingSystem and catalog JSON (see CURRICULUM_CATALOG_AND_ONBOARDING.md §3). */
export const TEACHING_SYSTEM_OPTIONS = [
  { value: 'national_morocco', label: 'Morocco · National' },
  { value: 'fr_ministere', label: 'France · Ministère' },
  { value: 'ib_myp', label: 'IB · MYP' },
  { value: 'us_common_core', label: 'US · Common Core' },
  { value: 'custom', label: 'Custom / other' },
] as const;

export type TeachingSystemSlug = (typeof TEACHING_SYSTEM_OPTIONS)[number]['value'];
