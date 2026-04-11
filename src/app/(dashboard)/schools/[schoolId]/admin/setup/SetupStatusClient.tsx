"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SetupStepKey =
  | "staticInitialization"
  | "temporalInitialization"
  | "gridInitialization"
  | "curriculumMapping"
  | "dsRecurringExams"
  | "generateTerm";

type SetupStepState = {
  key: SetupStepKey;
  title: string;
  complete: boolean;
  locked: boolean;
  optional: boolean;
  blockers: string[];
  fixHref: string;
};

type SchedulingSetupStatus = {
  schoolId: string;
  isReady: boolean;
  canGenerate: boolean;
  /** E7: when false, commit-style scheduling (generate commit, DS recurring commit) is blocked server-side. */
  schedulingPipelineEnabled: boolean;
  blockers: string[];
  steps: Record<SetupStepKey, SetupStepState>;
  checklist: { label: string; complete: boolean; blockers: string[] }[];
  ids: { activeAcademicYearId: string | null; activeTermId: string | null };
};

const STEP_ORDER: SetupStepKey[] = [
  "staticInitialization",
  "temporalInitialization",
  "gridInitialization",
  "curriculumMapping",
  "dsRecurringExams",
  "generateTerm",
];

const SetupStatusClient = ({ schoolId }: { schoolId: string }) => {
  const [status, setStatus] = useState<SchedulingSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/schools/${schoolId}/setup/scheduling-status`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to fetch setup status.");
      }
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch setup status.");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchStatus();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchStatus]);

  const stepList = useMemo(() => {
    if (!status) return [];
    return STEP_ORDER.map((key) => status.steps[key]).filter(Boolean);
  }, [status]);

  if (loading) {
    return <div className="p-4 md:p-6">Loading scheduling setup status...</div>;
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <div className="p-4 rounded-md border border-red-300 bg-red-50 text-red-700">{error}</div>
        <button
          onClick={() => void fetchStatus()}
          className="px-3 py-2 rounded bg-gray-900 text-white text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return <div className="p-4 md:p-6">No setup status available.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scheduling Setup</h1>
        <button
          onClick={() => void fetchStatus()}
          className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
        >
          Refresh Status
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/schools/${schoolId}/admin/scheduling-diagnostics`}
          className="underline font-medium text-gray-800"
        >
          Scheduling diagnostics
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href={`/schools/${schoolId}/admin/setup/bell-schedule`}
          className="underline font-medium text-gray-800"
        >
          Bell schedule
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href={`/schools/${schoolId}/admin/school-profile`}
          className="underline font-medium text-gray-800"
        >
          School profile
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href={`/schools/${schoolId}/admin/setup/catalog-install`}
          className="underline font-medium text-gray-800"
        >
          Catalog install
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href={`/schools/${schoolId}/admin/timetable-assistant`}
          className="underline font-medium text-gray-800"
        >
          Timetable assistant
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href={`/schools/${schoolId}/admin/timetable-assistant/school`}
          className="underline font-medium text-gray-800"
        >
          Whole-school draft
        </Link>
        <span className="text-gray-400">|</span>
        <span>
          Pipeline commits:{" "}
          <strong>{status.schedulingPipelineEnabled === false ? "disabled" : "enabled"}</strong>
        </span>
      </div>

      {status.schedulingPipelineEnabled === false && (
        <div className="p-4 rounded-md border border-red-200 bg-red-50 text-red-900 text-sm">
          Scheduling pipeline commits are disabled for this school (database flag). Term generation commit and
          recurring DS exam commit will return 403 until re-enabled. Dry-run generation may still be available
          depending on setup.
        </div>
      )}

      <div
        className={`p-4 rounded-md border ${
          status.canGenerate
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-amber-300 bg-amber-50 text-amber-800"
        }`}
      >
        <p className="font-medium">
          {status.canGenerate
            ? "Setup is complete. Generation actions are unlocked."
            : "Setup is incomplete. Generation actions remain locked."}
        </p>
        {!status.canGenerate && status.blockers.length > 0 && (
          <ul className="list-disc pl-5 mt-2 text-sm">
            {status.blockers.map((b, i) => (
              <li key={`${b}-${i}`}>{b}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-md border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Setup Stepper</h2>
          <p className="text-xs text-gray-500 mt-1">
            Grid initialization requires weekly lessons on the schedule and at least one active bell period.
          </p>
        </div>
        <div className="divide-y">
          {stepList.map((step) => (
            <div key={step.key} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{step.title}</p>
                  <p className="text-xs text-gray-500">
                    {step.optional ? "Optional step" : "Required step"}
                  </p>
                </div>
                <div className="text-sm">
                  {step.complete ? (
                    <span className="text-green-600 font-medium">Complete</span>
                  ) : step.locked ? (
                    <span className="text-amber-700 font-medium">Locked</span>
                  ) : (
                    <span className="text-blue-600 font-medium">Open</span>
                  )}
                </div>
              </div>
              {step.blockers.length > 0 && (
                <ul className="list-disc pl-5 mt-2 text-sm text-gray-700">
                  {step.blockers.map((b, i) => (
                    <li key={`${step.key}-${i}`}>{b}</li>
                  ))}
                </ul>
              )}
              {!step.complete && (
                <div className="mt-2">
                  <Link href={step.fixHref} className="text-sm underline font-medium">
                    Fix this step
                  </Link>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-md border">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Readiness Checklist</h2>
        </div>
        <div className="p-4 space-y-2">
          {status.checklist.map((item, idx) => (
            <div key={`${item.label}-${idx}`} className="text-sm">
              <span className={item.complete ? "text-green-700" : "text-amber-700"}>
                {item.complete ? "✓" : "•"} {item.label}
              </span>
              {!item.complete && item.blockers.length > 0 && (
                <p className="text-gray-600 ml-5">{item.blockers[0]}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SetupStatusClient;
