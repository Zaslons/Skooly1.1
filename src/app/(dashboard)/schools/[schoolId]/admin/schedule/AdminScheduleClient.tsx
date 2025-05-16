'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
// Remove useParams, use it in Server Component
// import { useParams } from 'next/navigation';
import BigCalendar from '@/components/BigCalender';
// Corrected imports for FullCalendar event argument types
import { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import { EventResizeDoneArg } from '@fullcalendar/interaction'; // Assuming this is the correct export location
import { adjustScheduleToCurrentWeek, cn, formatDateTimeToTimeString } from '@/lib/utils';
import { toast } from 'react-toastify';
import { updateLessonTime, createLesson, getTeacherAvailability } from '@/lib/actions'; // Import createLesson and getTeacherAvailability
import FormModal from '@/components/FormModal';
import { Lesson, TeacherAvailability, Day as PrismaDay } from '@prisma/client'; // Import Lesson, TeacherAvailability, PrismaDay type
import type { AuthUser } from '@/lib/auth'; // Import AuthUser for props

// Type matching the expected event structure for BigCalendar
type ScheduleEvent = {
  id?: string;
  title?: string; // Optional for background events
  start?: Date;   // Optional for recurring background events
  end?: Date;     // Optional for recurring background events
  daysOfWeek?: number[];
  startTime?: string; // For recurring events
  endTime?: string;   // For recurring events
  display?: 'background' | 'auto' | 'inverse-background'; // For background events, added inverse-background
  color?: string; // For background event color
  extendedProps: {
    // Lesson specific
    lessonId?: number;
    subject?: string;
    className?: string; // class name as in 'Math Class'
    teacher?: string;
    subjectId?: number;
    classId?: number;
    teacherId?: string; // Changed to string for CUID
    originalDay?: PrismaDay; // Changed to PrismaDay

    // Availability specific
    type?: 'availability';
    isAvailable?: boolean;
    notes?: string | null;
  };
  editable?: boolean; 
  eventStartEditable?: boolean; 
  eventDurationEditable?: boolean; 
};

// Type for related data needed by LessonForm
type LessonRelatedData = {
  subjects: any[];
  teachers: TeacherWithSubjects[]; // Added TeacherWithSubjects type
  classes: any[];
  schoolId: string; // Added schoolId to relatedData
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
}

const AdminScheduleClient = ({ initialLessons, initialRelatedData, authUser }: AdminScheduleClientProps) => {
  // Remove state for schoolId, get from props if needed or context
  // const params = useParams();
  // const schoolId = params.schoolId as string;
  
  // Initialize state from props
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false); // Loading is handled by server initially
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

  // Process initial data and filter based on selected class
  useEffect(() => {
    console.log("useEffect [initialLessons, selectedClassId, selectedTeacherId, teacherAvailabilitySlots] running. Filter Class:", selectedClassId, "Teacher:", selectedTeacherId);
    setLoading(true);
    try {
       const lessonsToFormat = selectedClassId
         ? initialLessons.filter(lesson => lesson.classId?.toString() === selectedClassId)
         : initialLessons;

       const formattedLessonEvents = lessonsToFormat.map((lesson: any) => ({
         id: lesson.id.toString(),
         title: `${lesson.subject.name} (${lesson.class.name})`,
         start: new Date(lesson.startTime),
         end: new Date(lesson.endTime),
         extendedProps: {
           lessonId: lesson.id,
           subject: lesson.subject.name,
           className: lesson.class.name,
           teacher: `${lesson.teacher.name} ${lesson.teacher.surname}`,
           subjectId: lesson.subject.id,
           classId: lesson.class.id,
           teacherId: lesson.teacher.id,
           originalDay: lesson.day as PrismaDay
         },
         // No top-level daysOfWeek, startTime, endTime for these lesson events
       } as ScheduleEvent)); // Added cast to ScheduleEvent

       let combinedEvents: ScheduleEvent[] = formattedLessonEvents;

      if (selectedTeacherId && teacherAvailabilitySlots.length > 0) {
        const unavailableSlots = teacherAvailabilitySlots.filter(slot => !slot.isAvailable);

        const availabilityEvents = unavailableSlots.map(slot => {
          const dayNumbers: Record<PrismaDay, number> = {
            MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 0
          };
          const dayNum = dayNumbers[slot.dayOfWeek];

          return {
            id: `avail-${slot.id}`,
            daysOfWeek: [dayNum],
            startTime: formatDateTimeToTimeString(slot.startTime), // HH:MM
            endTime: formatDateTimeToTimeString(slot.endTime),   // HH:MM
            display: 'background',
            color: 'rgba(255, 160, 122, 0.35)', // Consistent light red for unavailable
            extendedProps: {
                type: 'availability',
                isAvailable: slot.isAvailable, // will be false here
                notes: slot.notes
            },
            editable: false,
            eventStartEditable: false,
            eventDurationEditable: false,
          } as ScheduleEvent; 
        });
        combinedEvents = [...formattedLessonEvents, ...availabilityEvents];
      }
      
      setEvents(combinedEvents);

    } catch (error) {
        console.error("Error processing lessons and availability:", error);
        toast.error("Failed to process schedule data.");
        setEvents([]);
    } finally {
        setLoading(false);
    }
  }, [initialLessons, selectedClassId, selectedTeacherId, teacherAvailabilitySlots]); // Updated dependencies

  // NEW: Fetch teacher availability when selectedTeacherId or schoolId changes
  useEffect(() => {
    if (selectedTeacherId && authUser?.schoolId) {
      setAvailabilityLoading(true);
      setAvailabilityError(null);
      setTeacherAvailabilitySlots([]); // Clear previous slots
      // Ensure schoolId is correctly passed; using authUser.schoolId as it's reliable
      getTeacherAvailability(selectedTeacherId, authUser.schoolId)
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
  }, [selectedTeacherId, authUser?.schoolId, availabilityError]); // Added availabilityError to dependencies to avoid re-triggering on its own change

  // REMOVE useEffect for fetching data

  // --- Interaction Handlers --- 

   const handleSelect = useCallback((selectInfo: DateSelectArg) => {
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
        schoolId: authUser?.schoolId 
      };
    console.log("Setting modal config for CREATE:", modalData);
    setModalConfig({
      type: 'create',
      data: modalData,
      relatedData: relatedDataForForm,
    });
    setIsModalOpen(true);
  }, [relatedDataForForm, selectedClassId, selectedTeacherId, authUser?.schoolId]);

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
    const lessonId = parseInt(event.id);
    const dayString = getDayString(newStart?.getDay() ?? oldEvent.start?.getDay() ?? 0);

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
  }, [startTransition]);

   const handleEventResize = useCallback((resizeInfo: EventResizeDoneArg) => {
    const { event, revert } = resizeInfo; 
    const newStart = event.start;
    const newEnd = event.end;
    const lessonId = parseInt(event.id);
    const dayString = getDayString(newStart?.getDay() ?? event.start?.getDay() ?? 0);

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
  }, [startTransition]);

   const handleEventClick = useCallback((clickInfo: EventClickArg) => {
       console.log('Event clicked:', clickInfo.event);
       if (!relatedDataForForm) {
         toast.error("Cannot edit lesson: prerequisite data not loaded.");
         return;
       }
       // Prepare data for update form (extract from extendedProps)
       const eventData = clickInfo.event;
       const lessonDataForForm = {
           id: parseInt(eventData.id),
           name: "", // Name might not be directly on event, maybe fetch? Or just pass ID
           startTime: eventData.start,
           endTime: eventData.end,
           day: eventData.extendedProps.originalDay, // Use original day
           subjectId: eventData.extendedProps.subjectId,
           classId: eventData.extendedProps.classId,
           teacherId: eventData.extendedProps.teacherId,
           // Include related subject/class/teacher objects if needed by form defaultValues
           subject: { id: eventData.extendedProps.subjectId, name: eventData.extendedProps.subject },
           class: { id: eventData.extendedProps.classId, name: eventData.extendedProps.className },
           teacher: { id: eventData.extendedProps.teacherId, name: eventData.extendedProps.teacher.split(' ')[0], surname: eventData.extendedProps.teacher.split(' ')[1] || '' }
       };
       setModalConfig({
         type: 'update',
         data: lessonDataForForm,
         relatedData: relatedDataForForm,
       });
       setIsModalOpen(true);
   }, [relatedDataForForm]);

  // Handler for changing the selected class
  const handleClassChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedClassId(event.target.value);
  };

  // Helper to get teacher name for display
  const getTeacherDisplayName = (teacherId: string) => {
    const teacher = initialRelatedData.teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.name} ${teacher.surname}` : 'Selected Teacher';
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">Manage Schedule</h1>

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
            {getTeacherDisplayName(selectedTeacherId)}'s Explicit Time Blocks (Unavailable):
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
        <BigCalendar 
          data={events} 
          editable={true} 
          selectable={true} 
          select={handleSelect} 
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
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
    </div>
  );
};
export default AdminScheduleClient; 