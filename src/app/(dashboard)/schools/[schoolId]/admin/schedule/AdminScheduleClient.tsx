'use client';

import { useState, useEffect, useCallback, useTransition, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
// Remove useParams, use it in Server Component
// import { useParams } from 'next/navigation';
import type { ScheduleEvent } from '@/components/BigCalender';
import PeriodGridCalendar from '@/components/scheduling/period-grid/PeriodGridCalendar';
// Corrected imports for FullCalendar event argument types
import { DateSelectArg, EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core';
import { EventResizeDoneArg } from '@fullcalendar/interaction'; // Assuming this is the correct export location
import { adjustScheduleToCurrentWeek, cn, formatDateTimeToTimeString } from '@/lib/utils';
import { toast } from 'react-toastify';
import { updateLessonTime, createLesson, getTeacherAvailability } from '@/lib/actions'; // Import createLesson and getTeacherAvailability
import FormModal from '@/components/FormModal';
import { Lesson, TeacherAvailability, Day as PrismaDay } from '@prisma/client'; // Import Lesson, TeacherAvailability, PrismaDay type
import type { AuthUser } from '@/lib/auth'; // Import AuthUser for props
import Link from 'next/link';
import type {
  GenerateTermScheduleResponse,
  GenerateTermScheduleScope,
} from '@/lib/formValidationSchemas';
import type { CalendarInstanceEventDTO } from '@/lib/domain/calendarInstances';
import LessonSessionInstanceModal from '@/components/scheduling/LessonSessionInstanceModal';

// Type for related data needed by LessonForm
type LessonRelatedData = {
  subjects: any[];
  teachers: TeacherWithSubjects[];
  grades?: { id: number; level: string }[];
  classes: any[];
  rooms?: { id: number; name: string }[];
  schoolId: string;
  periods?: { id: string; name: string; startTime: string | Date; endTime: string | Date; order: number }[];
  periodsOnly?: boolean;
};

// Helper type for teachers in relatedData
type TeacherWithSubjects = {
  id: string;
  name: string;
  surname: string;
  // Add other relevant teacher fields if needed
};

// Helper to convert day number to day string expected by backend
const getDayString = (dayNumber: number): PrismaDay | null => { // Changed to PrismaDay
  switch (dayNumber) {
    case 1: return PrismaDay.MONDAY;
    case 2: return PrismaDay.TUESDAY;
    case 3: return PrismaDay.WEDNESDAY;
    case 4: return PrismaDay.THURSDAY;
    case 5: return PrismaDay.FRIDAY;
    default: return null; // Return null for Saturday/Sunday or invalid numbers
  }
};

// Define props for the client component
interface AdminScheduleClientProps {
  initialLessons: any[]; // Use a more specific type based on Prisma include if possible
  initialRelatedData: LessonRelatedData;
  authUser: AuthUser | null; // Added authUser prop
  schedulingReadiness: {
    isReady: boolean;
    activeAcademicYearId: string | null;
    activeTermId: string | null;
    blockers: string[];
  };
  setupStatus: {
    canGenerate: boolean;
    blockers: string[];
    ids?: {
      activeAcademicYearId: string | null;
      activeTermId: string | null;
    };
    steps: Record<
      string,
      {
        key: string;
        title: string;
        complete: boolean;
        locked: boolean;
        optional: boolean;
        blockers: string[];
        fixHref: string;
      }
    >;
    checklist: { label: string; complete: boolean; blockers: string[] }[];
  };
  /** Human-readable e.g. `Winter 2026 (2025-2026)` — from server; avoids showing raw term id */
  activeTermDisplay: string | null;
}

const AdminScheduleClient = ({
  initialLessons,
  initialRelatedData,
  authUser,
  schedulingReadiness,
  setupStatus,
  activeTermDisplay,
}: AdminScheduleClientProps) => {
  const pageSchoolId = initialRelatedData.schoolId;

  // Initialize state from props
  const [loading, setLoading] = useState(false); // legacy / availability only
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Add state for selected class filter
  const [selectedClassId, setSelectedClassId] = useState<string>(""); // Empty string for "All Classes"
  // NEW: State for teacher filter and availability
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [teacherAvailabilitySlots, setTeacherAvailabilitySlots] = useState<TeacherAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{
    type: 'create' | 'update'; // Allow update type
    data?: Partial<ScheduleEvent> | any; // Allow passing full lesson for update
    relatedData?: LessonRelatedData;
  } | null>(null);
  // Keep relatedData in state if it needs to be accessed by handlers easily
  const [relatedDataForForm, setRelatedDataForForm] = useState<LessonRelatedData>(initialRelatedData);

  // Lock parity with backend guards:
  // lesson creation/editing is protected by `temporalInitialization` (static + temporal prerequisites).
  const temporalStep = setupStatus.steps?.temporalInitialization;
  const canEditLessons = Boolean(temporalStep?.complete);
  const firstTemporalBlocker = temporalStep?.blockers?.[0] ?? schedulingReadiness.blockers?.[0];
  const setupHref = `/schools/${pageSchoolId}/admin/setup`;
  const activeTermId = setupStatus.ids?.activeTermId ?? null;

  // E4 term generation UI state (dry-run then commit confirmation).
  const router = useRouter();
  const [genLoading, setGenLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<GenerateTermScheduleResponse | null>(null);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [pendingCommit, setPendingCommit] = useState(false);
  const [generationIdempotencyKey, setGenerationIdempotencyKey] = useState<string | null>(null);
  const [genScopeType, setGenScopeType] = useState<'school' | 'grade' | 'class'>('school');
  const [genGradeId, setGenGradeId] = useState<string>('');
  const [genScopeClassId, setGenScopeClassId] = useState<string>('');
  const [genSimulateFailureAt, setGenSimulateFailureAt] = useState<string>('');

  // E5: unified calendar (instances + exams + overlays)
  const [instanceSourceEvents, setInstanceSourceEvents] = useState<ScheduleEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const lastRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const [showLayerLessons, setShowLayerLessons] = useState(true);
  const [showLayerExams, setShowLayerExams] = useState(true);
  const [showLayerOverlays, setShowLayerOverlays] = useState(true);
  const [showHolidayOverlays, setShowHolidayOverlays] = useState(true);
  const [showBreakOverlays, setShowBreakOverlays] = useState(true);
  const [showExamPeriodOverlays, setShowExamPeriodOverlays] = useState(true);
  const [instanceModalOpen, setInstanceModalOpen] = useState(false);
  const [instanceModalProps, setInstanceModalProps] = useState<Record<string, unknown> | null>(null);

  const refetchCalendar = useCallback(() => {
    const r = lastRangeRef.current;
    if (!r || !pageSchoolId) return;
    const params = new URLSearchParams({
      start: r.start.toISOString(),
      end: r.end.toISOString(),
    });
    if (selectedClassId) params.set('classId', selectedClassId);
    if (selectedTeacherId) params.set('teacherId', selectedTeacherId);
    setCalendarLoading(true);
    fetch(`/api/schools/${pageSchoolId}/calendar/instances?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { events?: CalendarInstanceEventDTO[] }) => {
        const mapped: ScheduleEvent[] = (data.events ?? []).map((ev) => ({
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
        setInstanceSourceEvents(mapped);
      })
      .catch(() => {
        toast.error('Failed to load calendar.');
        setInstanceSourceEvents([]);
      })
      .finally(() => setCalendarLoading(false));
  }, [pageSchoolId, selectedClassId, selectedTeacherId]);

  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      lastRangeRef.current = { start: arg.start, end: arg.end };
      refetchCalendar();
    },
    [refetchCalendar]
  );


  const buildGenerationScope = useCallback((): GenerateTermScheduleScope | null => {
    if (genScopeType === 'school') return { type: 'school' };
    if (genScopeType === 'grade') {
      const idNum = Number.parseInt(genGradeId, 10);
      if (!Number.isFinite(idNum) || idNum < 1) return null;
      return { type: 'grade', gradeId: idNum };
    }
    const idNum = Number.parseInt(genScopeClassId, 10);
    if (!Number.isFinite(idNum) || idNum < 1) return null;
    return { type: 'class', classId: idNum };
  }, [genScopeType, genGradeId, genScopeClassId]);

  // Changing scope invalidates a prior dry-run/commit pairing (roadmap 6.1 scope).
  useEffect(() => {
    setPendingCommit(false);
    setDryRunResult(null);
    setDryRunError(null);
    setGenerationIdempotencyKey(null);
  }, [genScopeType, genGradeId, genScopeClassId]);

  // E5: merge filtered instance API events + teacher availability overlays
  const calendarEvents = useMemo(() => {
    const filtered = instanceSourceEvents.filter((ev) => {
      const k = ev.extendedProps?.kind as string | undefined;
      if (k === 'lesson_session' && !showLayerLessons) return false;
      if (k === 'exam' && !showLayerExams) return false;
      if (k === 'overlay') {
        if (!showLayerOverlays) return false;
        const overlayType = ev.extendedProps?.overlayType as string | undefined;
        if (overlayType === 'HOLIDAY' && !showHolidayOverlays) return false;
        if (overlayType === 'BREAK' && !showBreakOverlays) return false;
        if (overlayType === 'EXAM_PERIOD' && !showExamPeriodOverlays) return false;
      }
      return true;
    });

    if (!selectedTeacherId || teacherAvailabilitySlots.length === 0) {
      return filtered;
    }

    const unavailableSlots = teacherAvailabilitySlots.filter((slot) => !slot.isAvailable);
    const dayNumbers: Record<PrismaDay, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 0,
    };
    const availabilityEvents = unavailableSlots.map((slot) => ({
      id: `avail-${slot.id}`,
      daysOfWeek: [dayNumbers[slot.dayOfWeek]],
      startTime: formatDateTimeToTimeString(slot.startTime),
      endTime: formatDateTimeToTimeString(slot.endTime),
      display: 'background' as const,
      color: 'rgba(255, 160, 122, 0.35)',
      extendedProps: {
        type: 'availability',
        kind: 'availability',
        isAvailable: slot.isAvailable,
        notes: slot.notes,
      },
      editable: false,
      eventStartEditable: false,
      eventDurationEditable: false,
    })) as ScheduleEvent[];

    return [...filtered, ...availabilityEvents];
  }, [
    instanceSourceEvents,
    showLayerLessons,
    showLayerExams,
    showLayerOverlays,
    showHolidayOverlays,
    showBreakOverlays,
    showExamPeriodOverlays,
    selectedTeacherId,
    teacherAvailabilitySlots,
  ]);

  useEffect(() => {
    if (lastRangeRef.current) {
      refetchCalendar();
    }
  }, [selectedClassId, selectedTeacherId, refetchCalendar]);

  // NEW: Fetch teacher availability when selectedTeacherId or schoolId changes
  useEffect(() => {
    if (selectedTeacherId && pageSchoolId) {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      setTeacherAvailabilitySlots([]); // Clear previous slots
      // Ensure schoolId is correctly passed; using pageSchoolId as it's reliable
      getTeacherAvailability(selectedTeacherId, pageSchoolId)
        .then(slots => {
          setTeacherAvailabilitySlots(slots || []); // Ensure slots is an array
          if ((!slots || slots.length === 0) && !availabilityError) { // Check for null/empty slots
            // Optionally set a message if no slots are found, or rely on visual cues
            // setAvailabilityError("Selected teacher has no availability set.");
          }
        })
        .catch(err => {
          console.error("Failed to fetch teacher availability:", err);
          setAvailabilityError("Could not load teacher availability.");
          setTeacherAvailabilitySlots([]); // Ensure it's an empty array on error
        })
        .finally(() => {
          setAvailabilityLoading(false);
        });
    } else {
      setTeacherAvailabilitySlots([]); // Clear if no teacher or schoolId
      setAvailabilityError(null); // Clear error
    }
  }, [selectedTeacherId, pageSchoolId, availabilityError]); // Added availabilityError to dependencies to avoid re-triggering on its own change

  // REMOVE useEffect for fetching data

  // --- Interaction Handlers --- 

   const handleSelect = useCallback((selectInfo: DateSelectArg) => {
    if (!canEditLessons) {
      toast.error(firstTemporalBlocker ?? "Schedule setup is incomplete.");
      return;
    }
    console.log("handleSelect triggered:", selectInfo);
    const dayNumber = selectInfo.start.getDay(); // 0 for Sunday, 1 for Monday, etc.
    const lessonDayPrisma = getDayString(dayNumber); // Converts to MONDAY, TUESDAY, etc. or null for Sat/Sun

    console.log("Calculated dayNumber:", dayNumber, "PrismaDay:", lessonDayPrisma);
    console.log("relatedDataForForm present?", !!relatedDataForForm);

    if (!lessonDayPrisma && (dayNumber !== 0 && dayNumber !== 6)) { // if getDayString returned null but it wasn't Sat/Sun
        console.log("Exiting handleSelect: Invalid day calculated by getDayString for a weekday.");
        toast.error("Cannot schedule on this day.");
        return;
    }
    
    if (!relatedDataForForm) {
      toast.error("Cannot create lesson: prerequisite data not loaded.");
      console.log("Exiting handleSelect: Missing relatedDataForForm.");
      return;
    }

    // --- NEW: Client-side pre-check for availability if a teacher is selected ---
    if (selectedTeacherId) {
      const lessonStart = selectInfo.start;
      const lessonEnd = selectInfo.end;

      // 1. Check default working hours (Mon-Fri, 8 AM - 5 PM)
      const DEFAULT_WORK_START_HOUR = 8;
      const DEFAULT_WORK_END_HOUR = 17;

      if (dayNumber === 0 || dayNumber === 6) { // Sunday (0) or Saturday (6)
        toast.warn(`Lessons are generally not scheduled on weekends. Form will open if you proceed.`);
        // Allow proceeding to form, form will show harder warning.
      } else { // Weekday
        const lessonStartHour = lessonStart.getHours();
        const lessonEndHour = lessonEnd.getHours();
        const lessonEndMinutes = lessonEnd.getMinutes();

        const isWithinDefaultHours =
          lessonStartHour >= DEFAULT_WORK_START_HOUR &&
          (lessonEndHour < DEFAULT_WORK_END_HOUR || (lessonEndHour === DEFAULT_WORK_END_HOUR && lessonEndMinutes === 0));

        if (!isWithinDefaultHours) {
          toast.error(`Selected time is outside default working hours (8 AM - 5 PM). Cannot create lesson.`);
          return;
        }
      }

      // 2. Check against teacher's explicitly UNAVAILABLE slots
      if (teacherAvailabilitySlots.length > 0 && lessonDayPrisma) { // lessonDayPrisma will be null for Sat/Sun, skip this check for them
        const conflictingUnavailableSlot = teacherAvailabilitySlots.find(slot => {
          if (slot.isAvailable || slot.dayOfWeek !== lessonDayPrisma) return false;

          const dbSlotStart = new Date(slot.startTime); // Slot time from DB (reference date)
          const dbSlotEnd = new Date(slot.endTime);     // Slot time from DB (reference date)

          // Normalize slot times to the lesson's actual date for comparison
          const effectiveSlotStart = new Date(lessonStart);
          effectiveSlotStart.setHours(dbSlotStart.getHours(), dbSlotStart.getMinutes(), 0, 0); // Zero out seconds/ms

          const effectiveSlotEnd = new Date(lessonStart); // Use lessonStart to get the date part
          effectiveSlotEnd.setHours(dbSlotEnd.getHours(), dbSlotEnd.getMinutes(), 0, 0); // Zero out seconds/ms
          
          // Overlap condition: (lessonStart < effectiveSlotEnd) AND (lessonEnd > effectiveSlotStart)
          return lessonStart < effectiveSlotEnd && lessonEnd > effectiveSlotStart;
        });

        if (conflictingUnavailableSlot) {
          toast.error("Selected time conflicts with the teacher's unavailable period. Cannot create lesson.");
          return;
        }
      }
    }
    // --- END: Client-side pre-check ---
    
    // If lessonDayPrisma is null (weekend), but teacher isn't selected or no conflicts, allow form opening
    // The form itself has robust checks.
    const dayForForm = lessonDayPrisma || (dayNumber === 0 ? PrismaDay.SUNDAY : PrismaDay.SATURDAY);


    // Pre-fill data for LessonForm
    const modalData = { 
        startTime: selectInfo.start,
        endTime: selectInfo.end,
        day: dayForForm, 
        classId: selectedClassId ? parseInt(selectedClassId) : undefined, 
        teacherId: selectedTeacherId || undefined,
        class: selectedClassId 
               ? relatedDataForForm.classes.find(c => c.id.toString() === selectedClassId) 
               : undefined,
        teacher: selectedTeacherId
                ? relatedDataForForm.teachers.find(t => t.id === selectedTeacherId)
                : undefined,
        schoolId: pageSchoolId 
      };
    console.log("Setting modal config for CREATE:", modalData);
    setModalConfig({
      type: 'create',
      data: modalData,
      relatedData: relatedDataForForm,
    });
    setIsModalOpen(true);
  }, [relatedDataForForm, selectedClassId, selectedTeacherId, pageSchoolId, canEditLessons, firstTemporalBlocker, teacherAvailabilitySlots]);

  const handleModalClose = (refreshNeeded: boolean) => {
    setIsModalOpen(false);
    setModalConfig(null);
    // Refresh is now handled by Server Component parent (revalidation in action)
    // We might need a local state update if revalidation is too slow, but start without it.
    // if (refreshNeeded) { 
    //   // Maybe trigger a refetch passed from parent or use router.refresh?
    // }
  };

  const handleEventDrop = useCallback((dropInfo: EventDropArg) => {
    const { event, oldEvent, revert } = dropInfo; // Destructure revert
    const newStart = event.start;
    const newEnd = event.end;
    const rawId = String(event.id);

    if (rawId.startsWith('ls-')) {
      const sessionId = Number.parseInt(rawId.replace(/^ls-/, ''), 10);
      if (!pageSchoolId || !newStart || !newEnd || Number.isNaN(sessionId)) {
        revert();
        return;
      }
      startTransition(async () => {
        const res = await fetch(`/api/schools/${pageSchoolId}/lesson-sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: newStart.toISOString(), endTime: newEnd.toISOString(), lastOverrideReason: 'Drag-drop reschedule' }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.error ?? 'Failed to move session.');
          revert();
        } else {
          toast.success('Session rescheduled (template unchanged).');
          refetchCalendar();
        }
      });
      return;
    }

    const lessonId = parseInt(rawId, 10);
    const dayString = getDayString(newStart?.getDay() ?? oldEvent.start?.getDay() ?? 0);

    if (!canEditLessons) {
      toast.error(firstTemporalBlocker ?? "Scheduling is locked until setup prerequisites are complete.");
      revert();
      return;
    }

    if (!newStart || !newEnd || !dayString || isNaN(lessonId)) {
      // Add detailed logging here
      console.error("Invalid lesson data for rescheduling. Details:", {
        newStart,
        newEnd,
        dayString,
        lessonId,
        rawEventId: event?.id
      }); 
      toast.error("Invalid lesson data for rescheduling.");
      revert(); // Call revert from dropInfo
      return;
    }

    startTransition(async () => {
      const result = await updateLessonTime({ success: false, error: false, message: "" }, { 
        id: lessonId, 
        startTime: newStart, 
        endTime: newEnd, 
        day: dayString as ("MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY") // Type assertion
      });
      if (result?.error) {
        toast.error(`Failed to move lesson: ${result.message}`);
        revert(); // Call revert from dropInfo
      } else {
        toast.success("Lesson rescheduled successfully!");
        // Data will be refreshed by path revalidation triggered by server action
      }
    });
  }, [startTransition, canEditLessons, firstTemporalBlocker, pageSchoolId, refetchCalendar]);

   const handleEventResize = useCallback((resizeInfo: EventResizeDoneArg) => {
    const { event, revert } = resizeInfo; 
    const newStart = event.start;
    const newEnd = event.end;
    const rawId = String(event.id);

    if (rawId.startsWith('ls-')) {
      const sessionId = Number.parseInt(rawId.replace(/^ls-/, ''), 10);
      if (!pageSchoolId || !newStart || !newEnd || Number.isNaN(sessionId)) {
        revert();
        return;
      }
      startTransition(async () => {
        const res = await fetch(`/api/schools/${pageSchoolId}/lesson-sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTime: newStart.toISOString(), endTime: newEnd.toISOString(), lastOverrideReason: 'Resize' }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err?.error ?? 'Failed to resize session.');
          revert();
        } else {
          toast.success('Session updated (template unchanged).');
          refetchCalendar();
        }
      });
      return;
    }

    const lessonId = parseInt(rawId, 10);
    const dayString = getDayString(newStart?.getDay() ?? event.start?.getDay() ?? 0);

    if (!canEditLessons) {
      toast.error(firstTemporalBlocker ?? "Scheduling is locked until setup prerequisites are complete.");
      revert();
      return;
    }

    if (!newStart || !newEnd || !dayString || isNaN(lessonId)) {
      console.error("Invalid lesson data for resizing. Details:", {
        newStart,
        newEnd,
        dayString,
        lessonId,
        rawEventId: event?.id
      });
      toast.error("Invalid lesson data for resizing.");
      revert(); 
      return;
    }

    startTransition(async () => {
      const result = await updateLessonTime({ success: false, error: false, message: "" }, { 
        id: lessonId, 
        startTime: newStart, 
        endTime: newEnd, 
        day: dayString as ("MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY") // Type assertion
      });
      if (result?.error) {
        toast.error(`Failed to resize lesson: ${result.message}`);
        revert(); 
      } else {
        toast.success("Lesson duration updated successfully!");
      }
    });
  }, [startTransition, canEditLessons, firstTemporalBlocker, pageSchoolId, refetchCalendar]);

   const handleEventClick = useCallback((clickInfo: EventClickArg) => {
       const eventData = clickInfo.event;
       const ep = eventData.extendedProps as Record<string, unknown>;

       if (ep?.type === 'availability' || ep?.kind === 'overlay') {
         return;
       }
       if (ep?.kind === 'exam') {
         toast('Exam blocks are edited from the Exams list or exam tools.', { type: 'info' });
         return;
       }
       if (ep?.kind === 'lesson_session') {
         setInstanceModalProps(ep);
         setInstanceModalOpen(true);
         return;
       }

       if (!canEditLessons) {
         toast.error(firstTemporalBlocker ?? "Scheduling is locked until setup prerequisites are complete.");
         return;
       }
       if (!relatedDataForForm) {
         toast.error("Cannot edit lesson: prerequisite data not loaded.");
         return;
       }
       const lessonDataForForm = {
           id: parseInt(String(eventData.id), 10),
           name: "",
           startTime: eventData.start,
           endTime: eventData.end,
           day: eventData.extendedProps.originalDay,
           subjectId: eventData.extendedProps.subjectId,
           classId: eventData.extendedProps.classId,
           teacherId: eventData.extendedProps.teacherId,
           subject: { id: eventData.extendedProps.subjectId, name: eventData.extendedProps.subject },
           class: { id: eventData.extendedProps.classId, name: eventData.extendedProps.className },
           teacher: { id: eventData.extendedProps.teacherId, name: eventData.extendedProps.teacher?.split?.(' ')?.[0], surname: eventData.extendedProps.teacher?.split?.(' ')?.[1] || '' }
       };
       setModalConfig({
         type: 'update',
         data: lessonDataForForm,
         relatedData: relatedDataForForm,
       });
       setIsModalOpen(true);
   }, [relatedDataForForm, canEditLessons, firstTemporalBlocker]);

  // Handler for changing the selected class
  const handleClassChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClassId(event.target.value);
  };

  const callGenerateTermSchedule = async (mode: "dryRun" | "commit") => {
    if (!pageSchoolId) {
      toast.error("Missing school context.");
      return;
    }
    if (!activeTermId) {
      toast.error("No active term found for this school.");
      return;
    }

    const scope = buildGenerationScope();
    if (!scope) {
      toast.error("Select a valid grade or class for this generation scope.");
      return;
    }

    const idempotencyKey =
      mode === "dryRun"
        ? crypto.randomUUID()
        : generationIdempotencyKey;

    if (!idempotencyKey) {
      toast.error("Missing idempotency key for commit.");
      return;
    }

    setGenLoading(true);
    setDryRunError(null);
    try {
      let simulateFailureAtOccurrenceIndex: number | undefined;
      if (genSimulateFailureAt.trim() !== '') {
        const n = Number.parseInt(genSimulateFailureAt, 10);
        if (Number.isFinite(n) && n >= 0) simulateFailureAtOccurrenceIndex = n;
      }

      const res = await fetch(`/api/schools/${pageSchoolId}/generate-term-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termId: activeTermId,
          mode,
          idempotencyKey,
          scope,
          ...(simulateFailureAtOccurrenceIndex !== undefined
            ? { simulateFailureAtOccurrenceIndex }
            : {}),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.code ?? "REQUEST_FAILED";
        const message = data?.error ?? "Request failed.";
        toast.error(`${code}: ${message}`);
        throw new Error(`${code}: ${message}`);
      }

      if (mode === "dryRun") {
        setGenerationIdempotencyKey(idempotencyKey);
        setDryRunResult(data as GenerateTermScheduleResponse);
        setPendingCommit(true);
        toast.success("Dry run complete. Review summary, then commit.");
      } else {
        setDryRunResult(data as GenerateTermScheduleResponse);
        setPendingCommit(false);
        toast.success("Lesson sessions generated for the term.");
        router.refresh();
        refetchCalendar();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed.";
      setDryRunError(message);
    } finally {
      setGenLoading(false);
    }
  };

  // Helper to get teacher name for display
  const getTeacherDisplayName = (teacherId: string) => {
    const teacher = initialRelatedData.teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.name} ${teacher.surname}` : 'Selected Teacher';
  };

  const handleGridLessonClick = useCallback(
    (eventData: ScheduleEvent) => {
      const mock = { event: eventData } as unknown as EventClickArg;
      handleEventClick(mock);
    },
    [handleEventClick]
  );

  const handleGridExamClick = useCallback(
    (eventData: ScheduleEvent) => {
      const mock = { event: eventData } as unknown as EventClickArg;
      handleEventClick(mock);
    },
    [handleEventClick]
  );

  const handleGridEmptyCellClick = useCallback(
    ({ day, periodId }: { day: Date; periodId: string }) => {
      const period = relatedDataForForm.periods?.find((p) => p.id === periodId);
      if (!period) return;
      const pStart = new Date(period.startTime);
      const pEnd = new Date(period.endTime);
      const start = new Date(day);
      start.setHours(pStart.getHours(), pStart.getMinutes(), 0, 0);
      const end = new Date(day);
      end.setHours(pEnd.getHours(), pEnd.getMinutes(), 0, 0);
      const mock = { start, end } as unknown as DateSelectArg;
      handleSelect(mock);
    },
    [relatedDataForForm.periods, handleSelect]
  );

  const handleGridEmptyRangeSelect = useCallback(
    ({ day, startPeriodId, endPeriodId }: { day: Date; startPeriodId: string; endPeriodId: string }) => {
      if (!canEditLessons) {
        toast.error(firstTemporalBlocker ?? "Schedule setup is incomplete.");
        return;
      }
      const periods = relatedDataForForm.periods ?? [];
      const startPeriod = periods.find((p) => p.id === startPeriodId);
      const endPeriod = periods.find((p) => p.id === endPeriodId);
      if (!startPeriod || !endPeriod) return;
      const dayNumber = day.getDay();
      const lessonDayPrisma = getDayString(dayNumber);
      const dayForForm = lessonDayPrisma || (dayNumber === 0 ? PrismaDay.SUNDAY : PrismaDay.SATURDAY);

      const start = new Date(day);
      const startP = new Date(startPeriod.startTime);
      start.setHours(startP.getHours(), startP.getMinutes(), 0, 0);
      const end = new Date(day);
      const endP = new Date(endPeriod.endTime);
      end.setHours(endP.getHours(), endP.getMinutes(), 0, 0);

      const modalData = {
        startTime: start,
        endTime: end,
        day: dayForForm,
        periodId: startPeriodId,
        endPeriodId: startPeriodId === endPeriodId ? undefined : endPeriodId,
        classId: selectedClassId ? parseInt(selectedClassId) : undefined,
        teacherId: selectedTeacherId || undefined,
        class: selectedClassId
          ? relatedDataForForm.classes.find(c => c.id.toString() === selectedClassId)
          : undefined,
        teacher: selectedTeacherId
          ? relatedDataForForm.teachers.find(t => t.id === selectedTeacherId)
          : undefined,
        schoolId: pageSchoolId
      };

      setModalConfig({
        type: 'create',
        data: modalData,
        relatedData: relatedDataForForm,
      });
      setIsModalOpen(true);
    },
    [
      canEditLessons,
      firstTemporalBlocker,
      relatedDataForForm,
      selectedClassId,
      selectedTeacherId,
      pageSchoolId,
    ]
  );

  const handleGridRangeChange = useCallback(
    (start: Date, end: Date) => {
      lastRangeRef.current = { start, end };
      refetchCalendar();
    },
    [refetchCalendar]
  );

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">Manage Schedule</h1>
      {!canEditLessons && (
        <div className="mb-4 p-4 rounded-md border border-amber-300 bg-amber-50 text-amber-800">
          <p className="font-semibold">Scheduling is locked until temporal setup is complete.</p>
          <ul className="list-disc pl-5 text-sm mt-2">
            {(temporalStep?.blockers?.length ? temporalStep.blockers : schedulingReadiness.blockers).map((blocker, idx) => (
              <li key={idx}>{blocker}</li>
            ))}
          </ul>
          {pageSchoolId && (
            <div className="mt-3 text-sm">
              <Link
                href={`/schools/${pageSchoolId}/admin/setup`}
                className="underline font-medium"
              >
                Go to Scheduling Setup
              </Link>
            </div>
          )}
          {setupStatus?.checklist?.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-medium mb-1">Readiness Checklist</p>
              <ul className="list-disc pl-5">
                {setupStatus.checklist.map((item, idx) => (
                  <li key={`${item.label}-${idx}`}>
                    {item.complete ? "✓" : "•"} {item.label}
                    {!item.complete && item.blockers[0] ? ` - ${item.blockers[0]}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* E4 Term Generation — expands weekly Lesson templates into dated LessonSession rows (see docs/scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) */}
      <div className="mb-4 p-4 rounded-md border border-indigo-200 bg-indigo-50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-indigo-900">Generate lesson sessions for this term</h2>
            <p className="text-sm text-indigo-800 mt-1">
              Builds dated lesson sessions from your <span className="font-medium">weekly templates</span>. The period
              grid below shows <span className="font-medium">instances</span> for the visible range—after you change
              templates, run a preview here so the term calendar fills in.
            </p>
            <p className="text-sm text-indigo-800 mt-2">
              Active term:{" "}
              <span className="font-medium">
                {activeTermDisplay ?? activeTermId ?? "—"}
              </span>
            </p>
            {pageSchoolId && (
              <p className="text-sm mt-2">
                <Link
                  href={`/schools/${pageSchoolId}/admin/scheduling-diagnostics`}
                  className="text-indigo-700 underline font-medium"
                >
                  Scheduling diagnostics
                </Link>
                <span className="text-indigo-800"> — audit log of generation runs and related activity.</span>
              </p>
            )}
            <div className="mt-3 space-y-2 text-sm text-indigo-900">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="genScope" className="font-medium">
                  Scope:
                </label>
                <select
                  id="genScope"
                  className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm"
                  value={genScopeType}
                  onChange={(e) =>
                    setGenScopeType(e.target.value as 'school' | 'grade' | 'class')
                  }
                  disabled={genLoading || !setupStatus.canGenerate}
                >
                  <option value="school">School-wide</option>
                  <option value="grade">One grade (all classes in grade)</option>
                  <option value="class">One class</option>
                </select>
                {genScopeType === 'grade' && (
                  <select
                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm min-w-[140px]"
                    value={genGradeId}
                    onChange={(e) => setGenGradeId(e.target.value)}
                    disabled={genLoading || !setupStatus.canGenerate}
                  >
                    <option value="">Select grade…</option>
                    {(initialRelatedData.grades ?? []).map((g) => (
                      <option key={g.id} value={String(g.id)}>
                        {g.level}
                      </option>
                    ))}
                  </select>
                )}
                {genScopeType === 'class' && (
                  <select
                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm min-w-[160px]"
                    value={genScopeClassId}
                    onChange={(e) => setGenScopeClassId(e.target.value)}
                    disabled={genLoading || !setupStatus.canGenerate}
                  >
                    <option value="">Select class…</option>
                    {initialRelatedData.classes.map((c: { id: number; name: string }) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {genScopeType === "school" && (
                <p className="text-xs text-indigo-800">
                  School-wide scope affects every class—use <span className="font-medium">Dry run</span> first to
                  preview counts and conflicts before <span className="font-medium">Commit</span>.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="genSimFail" className="text-indigo-700">
                  Rollback test (optional): fail at occurrence index
                </label>
                <input
                  id="genSimFail"
                  type="number"
                  min={0}
                  className="w-24 rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm"
                  placeholder="—"
                  value={genSimulateFailureAt}
                  onChange={(e) => setGenSimulateFailureAt(e.target.value)}
                  disabled={genLoading || !setupStatus.canGenerate}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!setupStatus.canGenerate || !activeTermId || genLoading}
              onClick={() => callGenerateTermSchedule("dryRun")}
            >
              {genLoading ? "Working..." : "Dry Run"}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!setupStatus.canGenerate || !activeTermId || genLoading || !pendingCommit}
              onClick={() => callGenerateTermSchedule("commit")}
            >
              {genLoading ? "Working..." : "Commit"}
            </button>
          </div>
        </div>

        {!setupStatus.canGenerate && (
          <div className="mt-3 text-sm text-amber-800">
            <p className="font-medium">Term generation is locked.</p>
            <ul className="list-disc pl-5 mt-1">
              {setupStatus.blockers?.length
                ? setupStatus.blockers.map((b, idx) => <li key={`${b}-${idx}`}>{b}</li>)
                : null}
            </ul>
          </div>
        )}

        {dryRunError && (
          <div className="mt-3 text-sm text-red-700">
            <p className="font-medium">Dry run failed</p>
            <p className="mt-1">{dryRunError}</p>
          </div>
        )}

        {dryRunResult && (
          <div className="mt-4">
            <div className="text-sm font-medium text-indigo-900">
              {pendingCommit ? "Dry run summary" : "Last run result"}
            </div>
            <p className="text-xs text-indigo-700 mt-1">
              Scope:{" "}
              <span className="font-mono">
                {dryRunResult.scope.type === "school"
                  ? "school-wide"
                  : dryRunResult.scope.type === "grade"
                    ? `grade:${dryRunResult.scope.gradeId}`
                    : `class:${dryRunResult.scope.classId}`}
              </span>
              {typeof dryRunResult.durationMs === "number" ? (
                <>
                  {" "}
                  · Duration: <span className="font-mono">{dryRunResult.durationMs} ms</span>
                </>
              ) : null}
            </p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="p-2 rounded-md bg-white border border-indigo-100">
                <div className="text-xs text-indigo-600">Total candidates</div>
                <div className="text-base font-semibold">{dryRunResult.summary.totalCandidates}</div>
              </div>
              <div className="p-2 rounded-md bg-white border border-indigo-100">
                <div className="text-xs text-indigo-600">Would create</div>
                <div className="text-base font-semibold">{dryRunResult.summary.createdCount}</div>
              </div>
              <div className="p-2 rounded-md bg-white border border-indigo-100">
                <div className="text-xs text-indigo-600">Conflicted</div>
                <div className="text-base font-semibold">{dryRunResult.summary.conflictedCount}</div>
              </div>
              <div className="p-2 rounded-md bg-white border border-indigo-100">
                <div className="text-xs text-indigo-600">Conflicts logged</div>
                <div className="text-base font-semibold">{dryRunResult.conflicts.length}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-sm font-medium text-indigo-900">Skipped by reason</div>
              <ul className="list-disc pl-5 text-sm mt-1">
                {Object.entries(dryRunResult.summary.skippedByReason).map(([reason, count]) => (
                  <li key={reason}>
                    {reason}: {count}
                  </li>
                ))}
              </ul>
            </div>

            {dryRunResult.conflicts.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-medium text-indigo-900">Exam overlap conflicts</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-xs bg-white border border-indigo-100 rounded-md">
                    <thead>
                      <tr className="bg-indigo-50">
                        <th className="px-3 py-2 text-left">Session Date</th>
                        <th className="px-3 py-2 text-left">Template Lesson</th>
                        <th className="px-3 py-2 text-left">Reason</th>
                        <th className="px-3 py-2 text-left">Overlapping Exams</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRunResult.conflicts.slice(0, 50).map((c, idx) => (
                        <tr key={`${c.templateLessonId}-${c.sessionDate.toString()}-${idx}`} className="border-t border-indigo-50">
                          <td className="px-3 py-2">{new Date(c.sessionDate).toLocaleDateString()}</td>
                          <td className="px-3 py-2">{c.templateLessonId}</td>
                          <td className="px-3 py-2">{c.reason}</td>
                          <td className="px-3 py-2">{c.overlappingExamIds.join(", ")}</td>
                        </tr>
                      ))}
                      {dryRunResult.conflicts.length > 50 && (
                        <tr>
                          <td className="px-3 py-2 text-gray-500" colSpan={4}>
                            Showing first 50 conflicts.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-indigo-800">
              Commit will create `LessonSession` rows for eligible slots (skipping duplicates and conflicts).
            </div>
            {pageSchoolId && (
              <div className="mt-3 text-sm">
                <Link
                  href={`/schools/${pageSchoolId}/admin/scheduling-diagnostics`}
                  className="text-indigo-700 underline font-medium"
                >
                  View in scheduling diagnostics
                </Link>
                <span className="text-indigo-800"> for this run in the audit log.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Class Filter Dropdown */}
      <div className="mb-4">
        <label htmlFor="classFilter" className="block text-sm font-medium text-gray-700 mr-2">Filter by Class:</label>
        <select
          id="classFilter"
          name="classFilter"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          value={selectedClassId}
          onChange={handleClassChange}
        >
          <option value="">All Classes</option>
          {initialRelatedData.classes.map((classItem: { id: number; name: string }) => (
            <option key={classItem.id} value={classItem.id.toString()}>
              {classItem.name}
            </option>
          ))}
        </select>
      </div>

      {/* NEW: Teacher Filter Dropdown */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg shadow">
        <label htmlFor="teacherFilter" className="block text-sm font-medium text-gray-700 mb-1">
          Filter by Teacher (for Availability View):
        </label>
        <select
          id="teacherFilter"
          name="teacherFilter"
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          value={selectedTeacherId}
          onChange={(e) => setSelectedTeacherId(e.target.value)}
          disabled={availabilityLoading}
        >
          <option value="">Select a Teacher</option>
          {initialRelatedData.teachers.map((teacher: TeacherWithSubjects) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name} {teacher.surname}
            </option>
          ))}
        </select>
        {availabilityLoading && <p className="text-xs text-gray-500 mt-1 italic">Loading teacher availability...</p>}
        {availabilityError && <p className="text-xs text-red-500 mt-1">{availabilityError}</p>}
      </div>
      
      {/* Display Teacher Availability if a teacher is selected */}
      {selectedTeacherId && !availabilityLoading && !availabilityError && teacherAvailabilitySlots.length > 0 && (
        <div className="mb-4 p-3 border border-gray-200 rounded-md bg-indigo-50 text-xs">
          <h3 className="font-semibold text-gray-700 mb-1.5">
            {getTeacherDisplayName(selectedTeacherId)}&apos;s Explicit Time Blocks (Unavailable):
          </h3>
          <ul className="space-y-1 list-disc list-inside">
            {teacherAvailabilitySlots.filter(slot => !slot.isAvailable).map(slot => (
              <li key={slot.id} className={cn(
                  "px-2 py-0.5 rounded text-white text-[10px] inline-block mr-1 mb-1",
                  "bg-red-500" // Consistently red for display list
              )}>
                {slot.dayOfWeek}: {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {slot.notes && <span className="italic text-gray-200"> ({slot.notes})</span>}
              </li>
            ))}
            {teacherAvailabilitySlots.filter(slot => !slot.isAvailable).length === 0 && (
              <li className="text-gray-500 italic">No specific unavailable blocks defined for this teacher. Assumed available Mon-Fri, 8 AM - 5 PM.</li>
            )}
          </ul>
        </div>
      )}

      {/* Calendar Container */}
      <div className="bg-white p-4 rounded-md shadow-md relative min-h-[600px]" style={{ height: 'calc(100vh - 200px)' }}> {/* Adjusted height slightly */}
        {calendarLoading && (
          <p className="text-xs text-gray-500 mb-2">Loading calendar…</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
          <span className="font-medium text-gray-700">Legend:</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-600" /> Lesson instance</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-600" /> Exam</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-yellow-400 border border-yellow-700" /> Recurring exam</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-300" /> Blocked day</span>
        </div>
        <div className="flex flex-wrap gap-4 mb-3 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showLayerLessons} onChange={(e) => setShowLayerLessons(e.target.checked)} />
            Lessons
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showLayerExams} onChange={(e) => setShowLayerExams(e.target.checked)} />
            Exams
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showLayerOverlays} onChange={(e) => setShowLayerOverlays(e.target.checked)} />
            Holidays / breaks / exam periods
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showHolidayOverlays} onChange={(e) => setShowHolidayOverlays(e.target.checked)} />
            Holidays
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showBreakOverlays} onChange={(e) => setShowBreakOverlays(e.target.checked)} />
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
          periods={relatedDataForForm.periods ?? []}
          loading={calendarLoading}
          onRangeChange={handleGridRangeChange}
          onLessonClick={handleGridLessonClick}
          onExamClick={handleGridExamClick}
          onEmptyCellClick={handleGridEmptyCellClick}
          onEmptyRangeSelect={handleGridEmptyRangeSelect}
        />
      </div>

      {/* Modal Rendering */}
      {isModalOpen && modalConfig && (
        <FormModal
          table="lesson" 
          type={modalConfig.type} 
          data={modalConfig.data} 
          relatedData={modalConfig.relatedData}
          isOpen={isModalOpen} 
          onClose={() => handleModalClose(false)}
          authUser={authUser} // Pass authUser prop
        />
      )}
      {pageSchoolId && (
        <LessonSessionInstanceModal
          isOpen={instanceModalOpen}
          onClose={(refresh) => {
            setInstanceModalOpen(false);
            setInstanceModalProps(null);
            if (refresh) refetchCalendar();
          }}
          schoolId={pageSchoolId}
          extendedProps={instanceModalProps}
          rooms={initialRelatedData.rooms ?? []}
          teachers={initialRelatedData.teachers}
        />
      )}
    </div>
  );
};
export default AdminScheduleClient; 