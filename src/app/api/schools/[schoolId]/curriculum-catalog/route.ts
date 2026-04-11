import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSchoolAccess } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getTemplateById, loadCatalogTemplatesFromDisk } from '@/lib/catalog/loadCatalogTemplates';
import { filterTemplatesForSchoolProfile } from '@/lib/catalog/filterTemplatesForSchool';

/**
 * GET /api/schools/[schoolId]/curriculum-catalog
 * Query: ?templateId=... — include full template body for that id (admin, same school).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const { schoolId } = params;
  if (!schoolId) {
    return NextResponse.json({ error: 'School ID required' }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;

  const userOrResponse = await requireRole(request, ['admin']);
  if (userOrResponse instanceof NextResponse) return userOrResponse;

  const { searchParams } = new URL(request.url);
  const templateId = searchParams.get('templateId');

  try {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { country: true, teachingSystem: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const all = loadCatalogTemplatesFromDisk();
    const { templates, filterActive } = filterTemplatesForSchoolProfile(all, school.country, school.teachingSystem);

    if (templateId) {
      const full = getTemplateById(templateId);
      if (!full) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }
      return NextResponse.json({
        filterActive,
        schoolCountry: school.country,
        schoolTeachingSystem: school.teachingSystem,
        template: full,
      });
    }

    const summaries = templates.map((t) => ({
      id: t.id,
      version: t.version,
      country: t.country,
      teachingSystem: t.teachingSystem,
      gradeLabels: t.gradeLabels,
      lineCount: t.lines.length,
    }));

    return NextResponse.json({
      filterActive,
      schoolCountry: school.country,
      schoolTeachingSystem: school.teachingSystem,
      templates: summaries,
    });
  } catch (e) {
    console.error('[curriculum-catalog GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
