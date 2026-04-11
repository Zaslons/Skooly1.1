"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { TeacherLesson, SchedulePageRelatedData } from "./page";
import type { AuthUser } from "@/lib/auth";
import { Day } from "@prisma/client";
import { formatDateTimeToTimeString } from "@/lib/utils";
import FormModal from "@/components/FormModal";
import ScheduleChangeRequestForm from "@/components/forms/ScheduleChangeRequestForm";
import type { ScheduleEvent } from "@/components/BigCalender";
import type { EventClickArg } from "@fullcalendar/core";
import type { CalendarInstanceEventDTO } from "@/lib/domain/calendarInstances";
import { toast } from "react-toastify";
import PeriodGridCalendar from "@/components/scheduling/period-grid/PeriodGridCalendar";

interface MyScheduleClientProps {
  relatedData: SchedulePageRelatedData;
  authUser: AuthUser;
  schoolId: string;
}

function dateToPrismaDay(d: Date): Day {
  const order = [
    Day.SUNDAY,
    Day.MONDAY,
    Day.TUESDAY,
    Day.WEDNESDAY,
    Day.THURSDAY,
    Day.FRIDAY,
    Day.SATURDAY,
  ];
  return order[d.getDay()];
}

/** Build template-lesson context for schedule-change requests from a calendar instance event. */
function lessonSessionToTeacherLesson(ev: {
  start: Date | null;
  end: Date | null;
  extendedProps: ScheduleEvent["extendedProps"];
}): TeacherLesson | null {
  const ep = ev.extendedProps;
  if (ep.kind !== "lesson_session") return null;
  const templateLessonId = ep.templateLessonId as number | undefined;
  if (templateLessonId == null || !ev.start || !ev.end) return null;
  const day = (ep.day as Day) ?? dateToPrismaDay(ev.start);
  return {
    id: templateLessonId,
    name: String(ep.subjectName ?? "Lesson"),
    day,
    startTime: ev.start.toISOString(),
    endTime: ev.end.toISOString(),
    subject: { id: Number(ep.subjectId) || 0, name: String(ep.subjectName ?? "") },
    class: { id: Number(ep.classId) || 0, name: String(ep.className ?? "") },
  };
}

const MyScheduleClient = ({
  relatedData,
  authUser,
  schoolId,
}: MyScheduleClientProps) => {
  const teacherId = authUser.profileId;

  const [instanceSourceEvents, setInstanceSourceEvents] = useState<ScheduleEvent[]>([]);
  const [todaySourceEvents, setTodaySourceEvents] = useState<ScheduleEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const lastRangeRef = useRef<{ start: Date; end: Date } | null>(null);

  const [showLayerLessons, setShowLayerLessons] = useState(true);
  const [showLayerExams, setShowLayerExams] = useState(true);
  const [showLayerOverlays, setShowLayerOverlays] = useState(true);
  const [showHolidayOverlays, setShowHolidayOverlays] = useState(true);
  const [showBreakOverlays, setShowBreakOverlays] = useState(true);
  const [showExamPeriodOverlays, setShowExamPeriodOverlays] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLessonForRequest, setSelectedLessonForRequest] = useState<TeacherLesson | null>(null);

  const mapDtoToScheduleEvents = useCallback((events: CalendarInstanceEventDTO[] | undefined): ScheduleEvent[] => {
    return (events ?? []).map((ev) => ({
      id: ev.id,
      title: ev.title,
      start: new Date(ev.start),
      end: new Date(ev.end),
      display: ev.display,
      backgroundColor: ev.backgroundColor,
      borderColor: ev.borderColor,
      textColor: ev.textColor,
      extendedProps: { ...ev.extendedProps, kind: ev.kind },
    }));
  }, []);

  const refetchCalendar = useCallback(() => {
    const r = lastRangeRef.current;
    if (!r || !teacherId) return;
    const params = new URLSearchParams({
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      teacherId,
    });
    setCalendarLoading(true);
    fetch(`/api/schools/${schoolId}/calendar/instances?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { events?: CalendarInstanceEventDTO[] }) => {
        setInstanceSourceEvents(mapDtoToScheduleEvents(data.events));
      })
      .catch(() => {
        toast.error("Failed to load calendar.");
        setInstanceSourceEvents([]);
      })
      .finally(() => setCalendarLoading(false));
  }, [schoolId, teacherId, mapDtoToScheduleEvents]);

  const refetchTodayPanel = useCallback(() => {
    if (!teacherId) return;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
      teacherId,
    });
    setTodayLoading(true);
    fetch(`/api/schools/${schoolId}/calendar/instances?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { events?: CalendarInstanceEventDTO[] }) => {
        setTodaySourceEvents(mapDtoToScheduleEvents(data.events));
      })
      .catch(() => setTodaySourceEvents([]))
      .finally(() => setTodayLoading(false));
  }, [schoolId, teacherId, mapDtoToScheduleEvents]);

  useEffect(() => {
    refetchTodayPanel();
  }, [refetchTodayPanel]);

  const calendarEvents = useMemo(() => {
    return instanceSourceEvents.filter((ev) => {
      const k = ev.extendedProps?.kind as string | undefined;
      if (k === "lesson_session" && !showLayerLessons) return false;
      if (k === "exam" && !showLayerExams) return false;
      if (k === "overlay") {
        if (!showLayerOverlays) return false;
        const overlayType = ev.extendedProps?.overlayType as string | undefined;
        if (overlayType === "HOLIDAY" && !showHolidayOverlays) return false;
        if (overlayType === "BREAK" && !showBreakOverlays) return false;
        if (overlayType === "EXAM_PERIOD" && !showExamPeriodOverlays) return false;
      }
      return true;
    });
  }, [
    instanceSourceEvents,
    showLayerLessons,
    showLayerExams,
    showLayerOverlays,
    showHolidayOverlays,
    showBreakOverlays,
    showExamPeriodOverlays,
  ]);

  const todayRows = useMemo(() => {
    return todaySourceEvents
      .filter((ev) => {
        const k = ev.extendedProps?.kind as string | undefined;
        if (k === "lesson_session" && !showLayerLessons) return false;
        if (k === "exam" && !showLayerExams) return false;
        if (k === "overlay") {
          if (!showLayerOverlays) return false;
          const overlayType = ev.extendedProps?.overlayType as string | undefined;
          if (overlayType === "HOLIDAY" && !showHolidayOverlays) return false;
          if (overlayType === "BREAK" && !showBreakOverlays) return false;
          if (overlayType === "EXAM_PERIOD" && !showExamPeriodOverlays) return false;
        }
        return k === "lesson_session" || k === "exam" || k === "overlay";
      })
      .sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
  }, [
    todaySourceEvents,
    showLayerLessons,
    showLayerExams,
    showLayerOverlays,
    showHolidayOverlays,
    showBreakOverlays,
    showExamPeriodOverlays,
  ]);

  const handleEventClick = useCallback(
    (clickInfo: EventClickArg) => {
      const ep = clickInfo.event.extendedProps as Record<string, unknown>;
      if (ep?.type === "availability" || ep?.kind === "overlay") return;
      if (ep?.kind === "exam") {
        toast("Exam details are managed from the school exams list.", { type: "info" });
        return;
      }
      if (ep?.kind === "lesson_session") {
        const tl = lessonSessionToTeacherLesson({
          start: clickInfo.event.start,
          end: clickInfo.event.end,
          extendedProps: ep as ScheduleEvent["extendedProps"],
        });
        if (tl) {
          setSelectedLessonForRequest(tl);
          setIsModalOpen(true);
        }
      }
    },
    []
  );

  const openRequestForEvent = useCallback((ev: ScheduleEvent) => {
    const tl = lessonSessionToTeacherLesson({
      start: ev.start ?? null,
      end: ev.end ?? null,
      extendedProps: ev.extendedProps,
    });
    if (tl) {
      setSelectedLessonForRequest(tl);
      setIsModalOpen(true);
    }
  }, []);

  const handleGridRangeChange = useCallback(
    (start: Date, end: Date) => {
      lastRangeRef.current = { start, end };
      refetchCalendar();
    },
    [refetchCalendar]
  );

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLessonForRequest(null);
    refetchTodayPanel();
    refetchCalendar();
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">My schedule</h1>
        <p className="text-sm text-gray-600 mt-1">
          Live timetable: generated lesson instances, exams, and school closures (same data as admin calendar, scoped to you).
        </p>
      </div>

      {/* Today — always uses local &quot;today&quot; range, independent of calendar navigation */}
      <section className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-indigo-900">Today — {todayLabel}</h2>
          <button
            type="button"
            onClick={() => refetchTodayPanel()}
            className="text-xs font-medium text-indigo-700 hover:underline"
          >
            Refresh
          </button>
        </div>
        {todayLoading ? (
          <p className="text-sm text-gray-600">Loading today…</p>
        ) : todayRows.length === 0 ? (
          <p className="text-sm text-gray-600">No lessons, exams, or closures in the list for today (check filters below).</p>
        ) : (
          <ul className="space-y-2">
            {todayRows.map((ev) => {
              const k = ev.extendedProps?.kind as string | undefined;
              const canRequest =
                k === "lesson_session" && (ev.extendedProps?.status as string | undefined) !== "CANCELLED";
              return (
                <li
                  key={ev.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2 shadow-sm border border-indigo-100/80"
                >
                  <div>
                    <div className="font-medium text-gray-800">{ev.title}</div>
                    <div className="text-xs text-gray-500">
                      {ev.start && ev.end
                        ? `${formatDateTimeToTimeString(ev.start)} – ${formatDateTimeToTimeString(ev.end)}`
                        : ""}
                      {k === "exam" && (
                        <span className="ml-2 text-amber-800">Exam</span>
                      )}
                      {k === "overlay" && (
                        <span className="ml-2 text-gray-600">Closure</span>
                      )}
                    </div>
                  </div>
                  {canRequest && (
                    <button
                      type="button"
                      onClick={() => openRequestForEvent(ev)}
                      className="shrink-0 text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-md"
                    >
                      Request change
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Week calendar */}
      <section className="bg-white p-4 rounded-md shadow-md relative min-h-[600px]" style={{ height: "calc(100vh - 280px)" }}>
        {calendarLoading && <p className="text-xs text-gray-500 mb-2">Loading calendar…</p>}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <span className="font-medium text-gray-700">Legend:</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-blue-600" /> Lesson instance
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-red-600" /> Exam
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-yellow-400 border border-yellow-700" /> Recurring exam
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded bg-gray-300" /> Blocked day
          </span>
        </div>
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLayerLessons}
              onChange={(e) => setShowLayerLessons(e.target.checked)}
            />
            Lessons
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLayerExams}
              onChange={(e) => setShowLayerExams(e.target.checked)}
            />
            Exams
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLayerOverlays}
              onChange={(e) => setShowLayerOverlays(e.target.checked)}
            />
            Holidays / breaks / exam periods
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showHolidayOverlays}
              onChange={(e) => setShowHolidayOverlays(e.target.checked)}
            />
            Holidays
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showBreakOverlays}
              onChange={(e) => setShowBreakOverlays(e.target.checked)}
            />
            Breaks
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showExamPeriodOverlays}
              onChange={(e) => setShowExamPeriodOverlays(e.target.checked)}
            />
            Exam periods
          </label>
        </div>
        <PeriodGridCalendar
          events={calendarEvents}
          periods={relatedData.periods}
          loading={calendarLoading}
          onRangeChange={handleGridRangeChange}
          onLessonClick={(ev) => handleEventClick({ event: ev } as unknown as EventClickArg)}
          onExamClick={(ev) => handleEventClick({ event: ev } as unknown as EventClickArg)}
        />
      </section>

      {isModalOpen && selectedLessonForRequest && (
        <FormModal table="lesson" type="create" isOpen={isModalOpen} onClose={handleCloseModal} authUser={authUser}>
          <ScheduleChangeRequestForm
            lesson={selectedLessonForRequest}
            schoolId={schoolId}
            requestingTeacherId={authUser.profileId!}
            otherTeachers={relatedData.teachers}
            onFormSubmitSuccess={handleCloseModal}
            onCancel={handleCloseModal}
          />
        </FormModal>
      )}
    </div>
  );
};

export default MyScheduleClient;
