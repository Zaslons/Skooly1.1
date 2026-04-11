"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type DiagnosticsPayload = {
  schoolId: string;
  schedulingPipelineEnabled: boolean;
  weeklyTemplateMinutes?: { online: number; inPerson: number };
  onlineWeeklyTemplatesMissingUrl?: {
    lessonId: number;
    name: string;
    day: string;
    teacher: string;
    teacherId: string;
    className: string;
    classId: number;
    subjectName: string;
  }[];
  termGenerations: {
    id: string;
    termId: string;
    requestId: string;
    idempotencyKey: string;
    mode: string;
    scopeType: string;
    scopeGradeId: number | null;
    scopeClassId: number | null;
    durationMs: number;
    success: boolean;
    errorCode: string | null;
    createdAt: string;
  }[];
  recurringCommits: {
    id: string;
    termId: string;
    requestId: string;
    durationMs: number;
    success: boolean;
    examsCreated: number;
    errorCode: string | null;
    createdAt: string;
  }[];
  exceptionAudits: {
    id: string;
    termId: string;
    exceptionId: string | null;
    actorAuthId: string | null;
    operation: string;
    createdAt: string;
  }[];
  exceptionTypeCounts: { type: string; count: number }[];
  latestExceptionConflicts: {
    commitId: string;
    createdAt: string;
    reasons: Record<string, number>;
  }[];
  lessonOverrides: {
    id: string;
    lessonSessionId: number;
    actorAuthId: string | null;
    createdAt: string;
  }[];
};

const SchedulingDiagnosticsClient = ({ schoolId }: { schoolId: string }) => {
  const [data, setData] = useState<DiagnosticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schools/${schoolId}/admin/scheduling-diagnostics`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load diagnostics.");
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load diagnostics.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="p-4 md:p-6">Loading scheduling diagnostics…</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-red-700">{error}</p>
        <button type="button" onClick={() => void load()} className="px-3 py-2 rounded bg-gray-900 text-white text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <div className="p-4 md:p-6">No data.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Scheduling diagnostics</h1>
          <p className="text-sm text-gray-600 mt-1">
            Recent term generation runs (template → lesson sessions), recurring exam commits, calendar exception
            mutations, and lesson instance overrides. Run generation from Admin schedule; use this page to audit results.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/schools/${schoolId}/admin/setup`} className="text-sm underline">
            Back to setup
          </Link>
          <Link href={`/schools/${schoolId}/admin/schedule`} className="text-sm underline">
            Admin schedule
          </Link>
          <button type="button" onClick={() => void load()} className="px-3 py-2 rounded border text-sm hover:bg-gray-50">
            Refresh
          </button>
        </div>
      </div>

      <div
        className={`p-4 rounded-md border ${
          data.schedulingPipelineEnabled ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"
        }`}
      >
        <p className="font-medium">
          Scheduling pipeline (commit-style writes):{" "}
          {data.schedulingPipelineEnabled ? "enabled" : "disabled — commits return 403"}
        </p>
      </div>

      {data.weeklyTemplateMinutes != null && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg">Online lessons (weekly templates)</h2>
          <p className="text-sm text-gray-600">
            Totals sum each template row once (one week&apos;s worth of wall-clock minutes per recurring lesson). Use{" "}
            <Link href={`/schools/${schoolId}/list/lessons`} className="underline">
              Lessons
            </Link>{" "}
            to add meeting links.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
            <div className="border rounded-md p-3 bg-white">
              <div className="text-xs text-gray-500">In-person (minutes / week)</div>
              <div className="text-xl font-semibold tabular-nums">{data.weeklyTemplateMinutes.inPerson}</div>
            </div>
            <div className="border rounded-md p-3 bg-indigo-50/80 border-indigo-100">
              <div className="text-xs text-indigo-800">Online (minutes / week)</div>
              <div className="text-xl font-semibold tabular-nums text-indigo-900">
                {data.weeklyTemplateMinutes.online}
              </div>
            </div>
          </div>
          {data.onlineWeeklyTemplatesMissingUrl && data.onlineWeeklyTemplatesMissingUrl.length > 0 ? (
            <div className="overflow-x-auto border rounded-md border-amber-200 bg-amber-50/40">
              <table className="min-w-full text-sm">
                <thead className="bg-amber-100/80">
                  <tr>
                    <th className="text-left p-2">Lesson</th>
                    <th className="text-left p-2">Day</th>
                    <th className="text-left p-2">Class</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {data.onlineWeeklyTemplatesMissingUrl.map((row) => (
                    <tr key={row.lessonId} className="border-t border-amber-100">
                      <td className="p-2">
                        <span className="font-mono text-xs text-gray-500">#{row.lessonId}</span> {row.name}
                      </td>
                      <td className="p-2 capitalize">{row.day.toLowerCase()}</td>
                      <td className="p-2">{row.className}</td>
                      <td className="p-2">{row.subjectName}</td>
                      <td className="p-2">{row.teacher}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-2 text-xs text-amber-900 border-t border-amber-100">
                {data.onlineWeeklyTemplatesMissingUrl.length} online template
                {data.onlineWeeklyTemplatesMissingUrl.length === 1 ? "" : "s"} with no meeting URL (showing up to 200).
              </p>
            </div>
          ) : (
            <p className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-md p-3">
              No online weekly templates are missing a meeting URL.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Term schedule generation</h2>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Mode</th>
                <th className="text-left p-2">OK</th>
                <th className="text-left p-2">ms</th>
                <th className="text-left p-2">Scope</th>
                <th className="text-left p-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.termGenerations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-3 text-gray-500">
                    No generation runs logged yet.
                  </td>
                </tr>
              ) : (
                data.termGenerations.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2">{row.mode}</td>
                    <td className="p-2">{row.success ? "yes" : "no"}</td>
                    <td className="p-2">{row.durationMs}</td>
                    <td className="p-2">
                      {row.scopeType}
                      {row.scopeClassId != null ? ` class ${row.scopeClassId}` : ""}
                      {row.scopeGradeId != null ? ` grade ${row.scopeGradeId}` : ""}
                    </td>
                    <td className="p-2 max-w-xs truncate" title={row.errorCode ?? ""}>
                      {row.errorCode ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Recurring DS exam commits</h2>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">OK</th>
                <th className="text-left p-2">Exams</th>
                <th className="text-left p-2">ms</th>
                <th className="text-left p-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {data.recurringCommits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-500">
                    No recurring commits logged yet.
                  </td>
                </tr>
              ) : (
                data.recurringCommits.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2">{row.success ? "yes" : "no"}</td>
                    <td className="p-2">{row.examsCreated}</td>
                    <td className="p-2">{row.durationMs}</td>
                    <td className="p-2 max-w-xs truncate" title={row.errorCode ?? ""}>
                      {row.errorCode ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Calendar exceptions snapshot</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {data.exceptionTypeCounts.length === 0 ? (
            <div className="text-sm text-gray-500">No exception rows yet.</div>
          ) : (
            data.exceptionTypeCounts.map((row) => (
              <div key={row.type} className="border rounded-md p-3 bg-white">
                <div className="text-xs text-gray-500">{row.type}</div>
                <div className="text-xl font-semibold">{row.count}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Calendar exception mutations</h2>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Operation</th>
                <th className="text-left p-2">Term</th>
                <th className="text-left p-2">Exception</th>
                <th className="text-left p-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.exceptionAudits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-gray-500">
                    No calendar exception audits logged yet.
                  </td>
                </tr>
              ) : (
                data.exceptionAudits.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2">{row.operation}</td>
                    <td className="p-2 font-mono text-xs">{row.termId}</td>
                    <td className="p-2 font-mono text-xs">{row.exceptionId ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{row.actorAuthId ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Latest exception conflicts (recurring exams)</h2>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Commit</th>
                <th className="text-left p-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {data.latestExceptionConflicts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-500">
                    No exception-related recurring conflicts found.
                  </td>
                </tr>
              ) : (
                data.latestExceptionConflicts.map((row) => (
                  <tr key={row.commitId} className="border-t">
                    <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2 font-mono text-xs">{row.commitId}</td>
                    <td className="p-2">
                      {Object.entries(row.reasons)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-lg">Lesson session overrides</h2>
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Session</th>
                <th className="text-left p-2">Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.lessonOverrides.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-gray-500">
                    No overrides logged yet.
                  </td>
                </tr>
              ) : (
                data.lessonOverrides.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="p-2">{row.lessonSessionId}</td>
                    <td className="p-2 font-mono text-xs">{row.actorAuthId ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SchedulingDiagnosticsClient;
