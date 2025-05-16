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
import { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core'; 
import { EventResizeDoneArg } from '@fullcalendar/interaction'; // Changed from @fullcalendar/core
import { Day as PrismaDay } from '@prisma/client'; // Import PrismaDay

// Define the event type expected by FullCalendar (can reuse our previous richer type)
// This type should match the one in AdminScheduleClient.tsx
type ScheduleEvent = {
  id?: string;
  title?: string; 
  start?: Date;   
  end?: Date;     
  daysOfWeek?: number[];
  startTime?: string; 
  endTime?: string;   
  display?: 'background' | 'auto' | 'inverse-background'; 
  color?: string; 
  extendedProps: {
    // Lesson specific
    lessonId?: number;
    subject?: string;
    className?: string; 
    teacher?: string;
    subjectId?: number;
    classId?: number;
    teacherId?: string; 
    originalDay?: PrismaDay; 

    // Availability specific
    type?: 'availability';
    isAvailable?: boolean;
    notes?: string | null;

    // General extendedProps from original BigCalender.tsx definition
    // Ensure these don't conflict or are handled correctly if AdminScheduleClient adds them
    // For example, if AdminScheduleClient.tsx sends subject, className, teacher in extendedProps
    // they are already covered above.
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

// Function to generate CSS class names and basic inline styles for events
const getEventStyling = (arg: any) => { // arg type can be refined using FullCalendar types like EventClassNamesGeneratorArg
  const subject = arg.event.extendedProps.subject || 'default'; // Ensure extendedProps.subject exists or handle safely
  const color = stringToColor(subject);
  const className = `subject-${subject.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

  // **IMPORTANT**: Inline styles are used here for simplicity.
  // Move these styles to a CSS file targeting the generated className for production.
  const style = `
    .${className} .fc-event-main {
      background-color: ${color} !important; 
      border-color: ${color} !important;
      color: black !important; /* Ensure text readability */ 
    }
    /* Optional: Style the time part differently */
    .${className} .fc-event-time {
        /* font-weight: bold; */
    }
  `;

  // Inject style tag - This is a HACK for demonstration, use CSS files instead.
  if (typeof window !== 'undefined' && !document.getElementById(className + '-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = className + '-style';
    styleEl.innerHTML = style;
    document.head.appendChild(styleEl);
  }

  return [className]; // Return the generated class name
};

// Function to render the inner content of an event
const renderEventContent = (eventInfo: any) => { // Use EventContentArg from FullCalendar for better typing
  return (
    <div className="fc-event-main-frame p-1"> {/* Add some padding maybe */}
      <div className="fc-event-title-container">
        <div className="fc-event-title fc-sticky" style={{ whiteSpace: 'normal' }}> {/* Allow wrapping */} 
          {eventInfo.event.title || ''} {/* Handle optional title */} 
        </div>
      </div>
      {/* Display Teacher Name */}
      <div className="fc-event-teacher text-xs opacity-90 mt-1"> {/* Style as needed */} 
         {eventInfo.event.extendedProps.teacher} {/* Use teacher from extendedProps if defined */}
      </div>
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
  eventResize // Callback for resize
}: {
  data: ScheduleEvent[];
  editable?: boolean;
  selectable?: boolean;
  select?: (selectInfo: DateSelectArg) => void;
  eventClick?: (clickInfo: EventClickArg) => void;
  eventDrop?: (dropInfo: EventDropArg) => void;
  eventResize?: (resizeInfo: EventResizeDoneArg) => void;
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
      selectMirror={true} // Shows a placeholder while selecting
      dayMaxEvents={true} // Allow "+more" link when too many events
      // Use the eventContent prop with our custom rendering function
      eventContent={renderEventContent} 
    />
  );
};

export default BigCalendar;
