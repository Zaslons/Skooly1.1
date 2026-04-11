"use client";

// Remove react-big-calendar and moment imports
// import { Calendar, momentLocalizer, View, Views, EventProps, EventWrapperProps, stringOrDate } from "react-big-calendar";
// import moment from "moment";
// import "react-big-calendar/lib/css/react-big-calendar.css"; // Keep or replace with FullCalendar CSS if needed

// Import FullCalendar components and plugins
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import dayGridPlugin from '@fullcalendar/daygrid'; // Needed for basic rendering?
import interactionPlugin from '@fullcalendar/interaction'; // Needed for future interactions
// Import interaction types - Attempt to import EventResizeDoneArg from @fullcalendar/interaction
import { DateSelectArg, EventClickArg, EventDropArg, DatesSetArg } from '@fullcalendar/core'; 
import { EventResizeDoneArg } from '@fullcalendar/interaction'; // Changed from @fullcalendar/core
import { Day as PrismaDay } from '@prisma/client'; // Import PrismaDay

/** FullCalendar event shape shared with schedule UIs (E5 instances + legacy templates). */
export type ScheduleEvent = {
  id?: string;
  title?: string;
  start?: Date;
  end?: Date;
  daysOfWeek?: number[];
  startTime?: string;
  endTime?: string;
  display?: 'background' | 'auto' | 'inverse-background';
  color?: string;
  /** E5: from CalendarInstanceEventDTO */
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps: {
    lessonId?: number;
    subject?: string;
    className?: string;
    teacher?: string;
    subjectId?: number;
    classId?: number;
    teacherId?: string;
    originalDay?: PrismaDay;
    type?: 'availability';
    isAvailable?: boolean;
    notes?: string | null;
    kind?: 'lesson_session' | 'exam' | 'overlay' | 'availability';
    /** DTO fields (lessonSessionId, examId, overlayType, …) — allow any extra keys */
    [key: string]: unknown;
  };
  editable?: boolean;
  eventStartEditable?: boolean;
  eventDurationEditable?: boolean;
};

// Remove react-big-calendar specific helpers
// const localizer = momentLocalizer(moment);
// const stringToColor = ...;
// const CustomHeader = ...;

// Helper function to generate consistent colors based on subject name (can be reused or replaced)
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    // Make colors less saturated and brighter for better background
    const adjustedValue = Math.min(255, Math.floor(value * 0.6 + 100)); 
    color += ('00' + adjustedValue.toString(16)).slice(-2);
  }
  return color;
};

// E5: color by kind; legacy template lessons use subject hash color
const getEventStyling = (arg: any) => {
  if (arg.event.backgroundColor) {
    return [];
  }
  const kind = arg.event.extendedProps?.kind as string | undefined;
  if (kind === 'lesson_session') return ['fc-e5-lesson-session'];
  if (kind === 'exam') return ['fc-e5-exam'];
  if (kind === 'overlay') return ['fc-e5-overlay'];
  const subject = arg.event.extendedProps.subject || 'default';
  const color = stringToColor(subject);
  const className = `subject-${subject.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
  const style = `
    .${className} .fc-event-main {
      background-color: ${color} !important;
      border-color: ${color} !important;
      color: black !important;
    }
  `;
  if (typeof window !== 'undefined' && !document.getElementById(className + '-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = className + '-style';
    styleEl.innerHTML = style;
    document.head.appendChild(styleEl);
  }
  return [className];
};

// Function to render the inner content of an event
const renderEventContent = (eventInfo: any) => {
  const ep = eventInfo.event.extendedProps || {};
  const sub =
    ep.kind === 'lesson_session'
      ? ep.effectiveTeacherName || ep.teacherName
      : ep.teacher;
  const badges: string[] = [];
  if (ep.kind === 'lesson_session' && Array.isArray(ep.popQuizzes) && ep.popQuizzes.length > 0) {
    for (const pq of ep.popQuizzes as { durationMinutes?: number; title?: string }[]) {
      const mins = pq.durationMinutes ?? '—';
      badges.push(`Quiz: ${mins} mins`);
    }
  }
  if (ep.kind === 'lesson_session' && Array.isArray(ep.assignmentDue) && ep.assignmentDue.length > 0) {
    badges.push('Assignment due');
  }
  return (
    <div className="fc-event-main-frame p-1">
      <div className="fc-event-title-container">
        <div className="fc-event-title fc-sticky" style={{ whiteSpace: 'normal' }}>
          {eventInfo.event.title || ''}
        </div>
      </div>
      {sub && (
        <div className="fc-event-teacher text-xs opacity-90 mt-1">{String(sub)}</div>
      )}
      {badges.length > 0 && (
        <div className="text-[10px] mt-0.5 font-medium text-white/90">{badges.join(' · ')}</div>
      )}
    </div>
  );
};

const BigCalendar = ({
  data,
  editable = false, // Default to false
  selectable = false, // Default to false
  select, // Callback for date selection
  eventClick, // Callback for event click
  eventDrop, // Callback for drag & drop
  eventResize, // Callback for resize
  datesSet,
}: {
  data: ScheduleEvent[];
  editable?: boolean;
  selectable?: boolean;
  select?: (selectInfo: DateSelectArg) => void;
  eventClick?: (clickInfo: EventClickArg) => void;
  eventDrop?: (dropInfo: EventDropArg) => void;
  eventResize?: (resizeInfo: EventResizeDoneArg) => void;
  datesSet?: (arg: DatesSetArg) => void;
}) => {
  // Remove react-big-calendar state and handlers
  // const [view, setView] = useState<View>(Views.WORK_WEEK);
  // const handleOnChangeView = ...;
  // const eventStyleGetter = ...;

  // FullCalendar doesn't need explicit height usually, it adapts to container
  // Style prop is removed for now

  return (
    <FullCalendar
      plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
      initialView="timeGridWeek" // Set the default view
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'timeGridWeek,timeGridDay' // View switcher
      }}
      events={data} // Pass the data (check if format works)
      allDaySlot={false} // Hide the all-day slot
      slotMinTime="08:00:00" // Set start time for the grid
      slotMaxTime="17:00:00" // Set end time for the grid
      // slotDuration="00:30:00" // Optional: Set slot duration
      // weekends={true} // Optional: Show/hide weekends (default true)
      eventClassNames={getEventStyling} // Use function to assign classes/styles
      // --- Pass through interaction props ---
      editable={editable}
      selectable={selectable}
      select={select}
      eventClick={eventClick} // Pass through eventClick
      eventDrop={eventDrop}
      eventResize={eventResize}
      datesSet={datesSet}
      selectMirror={true} // Shows a placeholder while selecting
      dayMaxEvents={true} // Allow "+more" link when too many events
      // Use the eventContent prop with our custom rendering function
      eventContent={renderEventContent} 
    />
  );
};

export default BigCalendar;
