"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScheduleEvent } from "@/components/BigCalender";
import type { CalendarInstanceEventDTO } from "@/lib/domain/calendarInstances";
import PeriodGridCalendar from "./PeriodGridCalendar";

type MeMembership = {
  id: string;
  schoolId: string;
  schoolName: string;
  role: string;
};

export default function TeacherMergedPeriodGrid({
  periods,
  gridSchoolName,
  fullScheduleHref,
}: {
  periods: Array<{ id: string; order: number; name: string; startTime: string | Date; endTime: string | Date }>;
  gridSchoolName: string;
  fullScheduleHref: string;
}) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSchoolId, setFilterSchoolId] = useState<string | null>(null);
  const [teacherSchools, setTeacherSchools] = useState<{ schoolId: string; schoolName: string }[]>([]);

  const lastRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { memberships?: MeMembership[] }) => {
        const list = (data.memberships ?? [])
          .filter((m) => m.role === "teacher")
          .map((m) => ({ schoolId: m.schoolId, schoolName: m.schoolName }));
        setTeacherSchools(list);
      })
      .catch(() => setTeacherSchools([]));
  }, []);

  const fetchRange = useCallback(
    (start: Date, end: Date) => {
      lastRangeRef.current = { start, end };
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      if (filterSchoolId) params.set("schoolId", filterSchoolId);
      setLoading(true);
      fetch(`/api/me/teacher-calendar?${params.toString()}`)
        .then((r) => r.json())
        .then((data: { events?: CalendarInstanceEventDTO[] }) => {
          setEvents(
            (data.events ?? []).map((ev) => ({
              id: ev.id,
              title: ev.title,
              start: new Date(ev.start),
              end: new Date(ev.end),
              display: ev.display,
              backgroundColor: ev.backgroundColor,
              borderColor: ev.borderColor,
              textColor: ev.textColor,
              extendedProps: { ...ev.extendedProps, kind: ev.kind },
            }))
          );
        })
        .catch(() => setEvents([]))
        .finally(() => setLoading(false));
    },
    [filterSchoolId]
  );

  useEffect(() => {
    const r = lastRangeRef.current;
    if (r) fetchRange(r.start, r.end);
  }, [filterSchoolId, fetchRange]);

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active
        ? "border-blue-500 bg-blue-50 text-blue-800"
        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
    }`;

  const showMultiSchoolChips = teacherSchools.length > 1;

  return (
    <div className="flex flex-col gap-3 mt-2">
      {showMultiSchoolChips && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-600">Schools:</span>
          <button type="button" onClick={() => setFilterSchoolId(null)} className={chipClass(filterSchoolId === null)}>
            All schools
          </button>
          {teacherSchools.map((s) => (
            <button
              key={s.schoolId}
              type="button"
              onClick={() => setFilterSchoolId(s.schoolId)}
              className={chipClass(filterSchoolId === s.schoolId)}
            >
              {s.schoolName}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">
        Period rows follow this page&apos;s bell schedule: <strong>{gridSchoolName}</strong>. Events may include other schools you teach at.
      </p>
      <Link href={fullScheduleHref} className="text-sm text-blue-600 hover:underline w-fit">
        Open full schedule in this school
      </Link>
      <PeriodGridCalendar events={events} periods={periods} loading={loading} onRangeChange={fetchRange} />
    </div>
  );
}
