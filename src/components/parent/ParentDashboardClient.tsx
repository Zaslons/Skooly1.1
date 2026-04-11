"use client";

import { useMemo, useState } from "react";
import ReadonlyPeriodGridContainer from "@/components/scheduling/period-grid/ReadonlyPeriodGridContainer";
import ParentChildFilterBar from "./ParentChildFilterBar";
import type { ParentDashboardItem } from "./types";

export default function ParentDashboardClient({ items }: { items: ParentDashboardItem[] }) {
  const [selected, setSelected] = useState<"all" | string>("all");

  const filterOptions = useMemo(() => {
    const distinctSchools = new Set(items.map((i) => i.schoolName));
    const showSchoolInChips = distinctSchools.size > 1;
    return items.map((i) => ({
      id: i.studentId,
      label: i.displayName,
      sublabel: showSchoolInChips ? i.schoolName : undefined,
    }));
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm bg-white rounded-md border border-gray-100 p-6">
        No children linked to your account yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ParentChildFilterBar
        options={filterOptions}
        selected={selected}
        onSelect={setSelected}
      />
      {items.map((item) => {
        const visible = selected === "all" || selected === item.studentId;
        if (!visible) {
          return null;
        }
        const { studentId, summary, periods, classId, schoolId } = item;

        return (
          <div key={studentId} className="bg-white rounded-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-0.5">
                  {item.schoolName}
                </p>
                <h2 className="text-lg font-semibold">{item.displayName}</h2>
                {summary && (
                  <p className="text-sm text-gray-500">
                    {summary.subjectGrades.length} subjects &middot; {summary.failedSubjectCount} failing
                  </p>
                )}
              </div>
              {summary?.gradeBand && (
                <span
                  className="px-3 py-1 rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: summary.gradeBand.color || "#e5e7eb",
                    color: summary.gradeBand.color ? "#fff" : "#374151",
                  }}
                >
                  {summary.gradeBand.label}
                </span>
              )}
            </div>

            {summary ? (
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-700">{summary.overallAverage.toFixed(1)}%</p>
                    <p className="text-xs text-blue-600">Average</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-700">{summary.attendanceRate.toFixed(0)}%</p>
                    <p className="text-xs text-green-600">Attendance</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-700">{summary.totalPresent}</p>
                    <p className="text-xs text-green-600">Present</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-red-700">{summary.totalAbsent}</p>
                    <p className="text-xs text-red-600">Absent</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {summary.subjectGrades.map((sg) => (
                    <div
                      key={sg.subjectId}
                      className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{sg.subjectName}</span>
                      <span
                        className={`font-semibold ${sg.isPassing ? "text-green-700" : "text-red-700"}`}
                      >
                        {sg.weightedAverage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-gray-400 text-sm">No academic data available yet.</div>
            )}

            {!!classId && (
              <div className="px-6 pb-4">
                <h3 className="text-sm font-semibold mb-2">Schedule</h3>
                <ReadonlyPeriodGridContainer
                  scope="classId"
                  id={classId}
                  schoolId={schoolId}
                  periods={periods}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
