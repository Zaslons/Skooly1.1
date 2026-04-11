'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { previewCatalogInstallAction, applyCatalogInstallAction } from '@/lib/actions/catalogInstallActions';
import type { CatalogInstallPreview } from '@/lib/domain/catalogInstallPreview';
import type { CatalogScalarUpdate } from '@/lib/domain/catalogInstallScalarRefresh';

type GradeRow = { id: number; level: string };
type AcademicYearRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  catalogTemplateId: string | null;
  catalogTemplateVersion: string | null;
  catalogInstalledAt: string | null;
};

type TemplateSummary = {
  id: string;
  version: string;
  country: string;
  teachingSystem: string;
  gradeLabels: string[];
  lineCount: number;
};

type CatalogListResponse = {
  filterActive: boolean;
  schoolCountry: string | null;
  schoolTeachingSystem: string | null;
  templates: TemplateSummary[];
};

type CatalogDetailResponse = CatalogListResponse & {
  template: {
    id: string;
    version: string;
    country: string;
    teachingSystem: string;
    gradeLabels: string[];
    lines: Array<{
      subjectCode: string;
      subjectNameDefault: string;
      gradeIndices: number[];
      coefficient?: number;
      periodsPerWeek?: number | null;
    }>;
  };
};

export default function CatalogInstallClient({
  schoolId,
  schoolName,
  schoolCountry,
  schoolTeachingSystem,
  grades,
  academicYears,
  initialAcademicYearId,
}: {
  schoolId: string;
  schoolName: string;
  schoolCountry: string | null;
  schoolTeachingSystem: string | null;
  grades: GradeRow[];
  academicYears: AcademicYearRow[];
  initialAcademicYearId: string;
}) {
  const router = useRouter();
  const [listPayload, setListPayload] = useState<CatalogListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [templateId, setTemplateId] = useState('');
  const [detail, setDetail] = useState<CatalogDetailResponse['template'] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [academicYearId, setAcademicYearId] = useState(initialAcademicYearId);
  const [mapping, setMapping] = useState<Record<number, string>>({});

  const [preview, setPreview] = useState<CatalogInstallPreview | null>(null);
  const [scalarUpdates, setScalarUpdates] = useState<CatalogScalarUpdate[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ id: string; version: string; gradeLabels: string[] } | null>(
    null
  );
  const [refreshScalarsFromTemplate, setRefreshScalarsFromTemplate] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedYear = useMemo(() => academicYears.find((y) => y.id === academicYearId), [academicYears, academicYearId]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch(`/api/schools/${schoolId}/curriculum-catalog`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load catalog.');
      }
      setListPayload(data);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load catalog.');
    } finally {
      setLoadingList(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string) => {
      if (!id) {
        setDetail(null);
        return;
      }
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/schools/${schoolId}/curriculum-catalog?templateId=${encodeURIComponent(id)}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as CatalogDetailResponse;
        if (!res.ok) {
          throw new Error((data as { error?: string }).error || 'Failed to load template.');
        }
        setDetail(data.template);
        setMapping({});
        setPreview(null);
        setScalarUpdates([]);
        setPreviewMeta(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load template.');
        setDetail(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [schoolId]
  );

  useEffect(() => {
    if (templateId) {
      void loadDetail(templateId);
    } else {
      setDetail(null);
      setMapping({});
      setPreview(null);
      setScalarUpdates([]);
      setPreviewMeta(null);
    }
  }, [templateId, loadDetail]);

  const gradeMappingPayload = useMemo(() => {
    if (!detail) return [];
    return detail.gradeLabels.map((_, i) => ({
      templateIndex: i,
      gradeId: Number(mapping[i]),
    })).filter((e) => Number.isFinite(e.gradeId) && e.gradeId > 0);
  }, [detail, mapping]);

  const runPreview = () => {
    if (!detail || !academicYearId) {
      toast.error('Select an academic year and template.');
      return;
    }
    startTransition(async () => {
      const res = await previewCatalogInstallAction({
        schoolId,
        academicYearId,
        templateId: detail.id,
        gradeMapping: gradeMappingPayload,
        refreshScalarsFromTemplate,
      });
      if (res.success) {
        setPreview(res.preview);
        setScalarUpdates(res.scalarUpdates ?? []);
        setPreviewMeta(res.template);
        if (res.preview.unmappedGradeIndices.length > 0) {
          toast.warn(`Map grade indices: ${res.preview.unmappedGradeIndices.join(', ')}`);
        } else {
          toast.success('Preview ready.');
        }
      } else {
        toast.error(res.message);
      }
    });
  };

  const runApply = () => {
    if (!detail || !academicYearId) {
      toast.error('Select an academic year and template.');
      return;
    }
    if (!preview) {
      toast.error('Run preview first.');
      return;
    }
    if (preview.unmappedGradeIndices.length > 0) {
      toast.error('Fix grade mapping before applying.');
      return;
    }
      if (
      !window.confirm(
        `Apply this catalog to the selected academic year? New subjects and rows may be created.${
          refreshScalarsFromTemplate && scalarUpdates.length > 0
            ? ` ${scalarUpdates.length} existing row(s) will have coefficient / periods per week updated from the template.`
            : ''
        } Nothing is deleted. This is a starting point only — not legal compliance.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await applyCatalogInstallAction({
        schoolId,
        academicYearId,
        templateId: detail.id,
        gradeMapping: gradeMappingPayload,
        refreshScalarsFromTemplate,
      });
      if (res.success) {
        toast.success(res.message);
        void loadList();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const profileHint =
    !schoolCountry || !schoolTeachingSystem
      ? 'Set your school country and teaching system to narrow catalog recommendations.'
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Install curriculum from catalog</h1>
        <p className="mt-1 text-sm text-gray-600">{schoolName}</p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Disclaimer</p>
        <p className="mt-1">
          Catalog templates are a <strong>starting point</strong> for planning. They do not guarantee regulatory or
          legal compliance. Review each subject and grade mapping before relying on this data.
        </p>
      </div>

      {profileHint && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {profileHint}{' '}
          <Link href={`/schools/${schoolId}/admin/school-profile`} className="font-medium underline">
            School profile
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/schools/${schoolId}/admin/setup`} className="text-indigo-700 underline">
          Scheduling setup
        </Link>
        <span className="text-gray-400">|</span>
        <Link href={`/schools/${schoolId}/admin/school-profile`} className="text-indigo-700 underline">
          School profile
        </Link>
      </div>

      {loadingList && <p className="text-sm text-gray-600">Loading catalog…</p>}
      {listError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{listError}</div>
      )}

      {listPayload && (
        <p className="text-xs text-gray-500">
          {listPayload.filterActive
            ? `Showing templates matching country ${listPayload.schoolCountry ?? '—'} and teaching system ${listPayload.schoolTeachingSystem ?? '—'}.`
            : 'Showing all catalog templates (set school profile to filter).'}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="academicYear" className="block text-sm font-medium text-gray-700">
            Academic year
          </label>
          <select
            id="academicYear"
            value={academicYearId}
            onChange={(e) => setAcademicYearId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={isPending || academicYears.length === 0}
          >
            <option value="">Select…</option>
            {academicYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} ({new Date(y.startDate).toLocaleDateString()} – {new Date(y.endDate).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="template" className="block text-sm font-medium text-gray-700">
            Catalog template
          </label>
          <select
            id="template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={isPending || !listPayload?.templates.length}
          >
            <option value="">Select…</option>
            {listPayload?.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} v{t.version} ({t.lineCount} lines)
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedYear && academicYearId && (
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800">
          {selectedYear.catalogTemplateId ? (
            <div className="space-y-1">
              <p className="font-medium text-gray-900">Catalog install on this academic year</p>
              <p>
                Template <span className="font-mono">{selectedYear.catalogTemplateId}</span> — installed version{' '}
                <span className="font-mono">{selectedYear.catalogTemplateVersion ?? '—'}</span>
                {selectedYear.catalogInstalledAt
                  ? ` · ${new Date(selectedYear.catalogInstalledAt).toLocaleString()}`
                  : ''}
              </p>
              {detail && detail.id === selectedYear.catalogTemplateId && (
                <p
                  className={
                    selectedYear.catalogTemplateVersion !== detail.version
                      ? 'font-medium text-amber-900'
                      : 'text-gray-700'
                  }
                >
                  Pack on disk: <span className="font-mono">v{detail.version}</span>
                  {selectedYear.catalogTemplateVersion !== detail.version && (
                    <span>
                      {' '}
                      — differs from installed version. Run Preview to pick up new lines or refresh scalars.
                    </span>
                  )}
                </p>
              )}
              {detail && detail.id !== selectedYear.catalogTemplateId && (
                <p className="font-medium text-amber-900">
                  Selected template ({detail.id}) differs from the catalog recorded for this year.
                </p>
              )}
            </div>
          ) : (
            <p className="text-gray-600">No catalog install recorded for this academic year yet.</p>
          )}
        </div>
      )}

      {loadingDetail && <p className="text-sm text-gray-600">Loading template…</p>}

      {detail && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Map template grades to school grades</h2>
            <p className="text-xs text-gray-500">
              Each row is a label from the template. Choose the matching grade in your school.
            </p>
          </div>
          <div className="space-y-2">
            {detail.gradeLabels.map((label, i) => (
              <div key={i} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm text-gray-700 sm:w-48">
                  {label} <span className="text-gray-400">(index {i})</span>
                </span>
                <select
                  value={mapping[i] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                  className="max-w-md flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
                  disabled={isPending || grades.length === 0}
                >
                  <option value="">Select grade…</option>
                  {grades.map((g) => (
                    <option key={g.id} value={String(g.id)}>
                      {g.level}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {grades.length === 0 && (
            <p className="text-sm text-amber-800">Add grades for this school before installing a catalog.</p>
          )}

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800">
            <input
              type="checkbox"
              className="mt-1"
              checked={refreshScalarsFromTemplate}
              onChange={(e) => {
                setRefreshScalarsFromTemplate(e.target.checked);
                setPreview(null);
                setScalarUpdates([]);
                setPreviewMeta(null);
              }}
              disabled={isPending}
            />
            <span>
              <span className="font-medium">Refresh coefficient and periods/week</span> from the template for rows that
              already exist (same grade + subject name). Non-destructive: nothing is deleted; only matching rows are
              updated when you Apply.
            </span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => runPreview()}
              disabled={isPending || !academicYearId}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? 'Working…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => runApply()}
              disabled={isPending || !academicYearId || !preview}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {preview && previewMeta && (
        <div className="space-y-4 border-t pt-6">
          <h2 className="text-lg font-semibold">Preview</h2>
          <p className="text-xs text-gray-500">
            Template {previewMeta.id} ({previewMeta.version})
          </p>

          {preview.unmappedGradeIndices.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              Unmapped grade indices used in the template: {preview.unmappedGradeIndices.join(', ')}. Assign a school
              grade for each.
            </div>
          )}

          <div>
            <h3 className="font-medium text-gray-900">Subjects to create</h3>
            {preview.subjectsToCreate.length === 0 ? (
              <p className="text-sm text-gray-600">None</p>
            ) : (
              <ul className="list-disc pl-5 text-sm">
                {preview.subjectsToCreate.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="font-medium text-gray-900">Curriculum rows to add</h3>
            {preview.curriculumToAdd.length === 0 ? (
              <p className="text-sm text-gray-600">None</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-4">Grade</th>
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Coefficient</th>
                      <th className="py-2 pr-4">Periods / week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.curriculumToAdd.map((row, idx) => (
                      <tr key={`${row.gradeId}-${row.subjectName}-${idx}`} className="border-b border-gray-100">
                        <td className="py-2 pr-4">{row.gradeLevelLabel}</td>
                        <td className="py-2 pr-4">{row.subjectName}</td>
                        <td className="py-2 pr-4">{row.coefficient}</td>
                        <td className="py-2 pr-4">{row.periodsPerWeek ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="font-medium text-gray-900">Skipped</h3>
            {preview.skipped.length === 0 ? (
              <p className="text-sm text-gray-600">None</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-gray-700">
                {preview.skipped.map((s, i) => (
                  <li key={i}>
                    {s.gradeLevelLabel} — {s.subjectName} ({s.reason})
                  </li>
                ))}
              </ul>
            )}
          </div>

          {refreshScalarsFromTemplate && (
            <div>
              <h3 className="font-medium text-gray-900">Existing rows — coefficient / periods (updates)</h3>
              {scalarUpdates.length === 0 ? (
                <p className="text-sm text-gray-600">None — all matching rows already match the template, or none found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 pr-4">Grade</th>
                        <th className="py-2 pr-4">Subject</th>
                        <th className="py-2 pr-4">Coefficient</th>
                        <th className="py-2 pr-4">Periods / week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scalarUpdates.map((u) => (
                        <tr key={u.curriculumId} className="border-b border-gray-100">
                          <td className="py-2 pr-4">{u.gradeLevelLabel}</td>
                          <td className="py-2 pr-4">{u.subjectName}</td>
                          <td className="py-2 pr-4">
                            {u.fromCoefficient} → {u.toCoefficient}
                          </td>
                          <td className="py-2 pr-4">
                            {u.fromPeriodsPerWeek ?? '—'} → {u.toPeriodsPerWeek ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
