import type { CatalogTemplate } from './catalogTemplateSchema';

/**
 * If both school country and teaching system are set, return templates that match both.
 * If either is unset, return all templates (caller may show UI hint to narrow profile).
 */
export function filterTemplatesForSchoolProfile(
  templates: CatalogTemplate[],
  schoolCountry: string | null | undefined,
  schoolTeachingSystem: string | null | undefined
): { templates: CatalogTemplate[]; filterActive: boolean } {
  const c = schoolCountry?.trim().toUpperCase() || null;
  const ts = schoolTeachingSystem?.trim() || null;
  if (c && ts) {
    return {
      templates: templates.filter((t) => t.country === c && t.teachingSystem === ts),
      filterActive: true,
    };
  }
  return { templates, filterActive: false };
}
