"use client";

import { useCallback, useState } from "react";
import type { ScheduleEvent } from "@/components/BigCalender";
import type { CalendarInstanceEventDTO } from "@/lib/domain/calendarInstances";
import PeriodGridCalendar from "./PeriodGridCalendar";

export default function ReadonlyPeriodGridContainer({
  scope,
  id,
  schoolId,
  periods,
}: {
  scope: "teacherId" | "classId";
  id: string | number;
  schoolId: string;
  periods: Array<{ id: string; order: number; name: string; startTime: string | Date; endTime: string | Date }>;
}) {
  const teacherId = scope === "teacherId" ? String(id) : undefined;
  const classId = scope === "classId" ? Number(id) : undefined;
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRange = useCallback(
    (start: Date, end: Date) => {
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      if (teacherId) params.set("teacherId", teacherId);
      if (classId != null && !Number.isNaN(classId)) params.set("classId", String(classId));
      setLoading(true);
      fetch(`/api/schools/${schoolId}/calendar/instances?${params.toString()}`)
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
    [schoolId, teacherId, classId]
  );

  return (
    <PeriodGridCalendar
      events={events}
      periods={periods}
      loading={loading}
      onRangeChange={fetchRange}
    />
  );
}
