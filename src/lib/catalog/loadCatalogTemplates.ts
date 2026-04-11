import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CatalogTemplateSchema, type CatalogTemplate } from './catalogTemplateSchema';

/**
 * Load and validate all `*.json` templates from the repo `catalog/` directory (server-only).
 */
export function loadCatalogTemplatesFromDisk(): CatalogTemplate[] {
  const root = process.cwd();
  const catalogDir = join(root, 'catalog');
  let files: string[];
  try {
    files = readdirSync(catalogDir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: CatalogTemplate[] = [];
  for (const file of files) {
    const raw = readFileSync(join(catalogDir, file), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const result = CatalogTemplateSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`[catalog] Invalid template ${file}:`, result.error.flatten());
      continue;
    }
    out.push(result.data);
  }
  return out;
}

export function getTemplateById(id: string): CatalogTemplate | null {
  return loadCatalogTemplatesFromDisk().find((t) => t.id === id) ?? null;
}
