// IT APPEARS THAT BIG CALENDAR SHOWS THE LAST WEEK WHEN THE CURRENT DAY IS A WEEKEND.
// FOR THIS REASON WE'LL GET THE LAST WEEK AS THE REFERENCE WEEK.
// IN THE TUTORIAL WE'RE TAKING THE NEXT WEEK AS THE REFERENCE WEEK.

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Day } from '@prisma/client';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Reference Monday: Use a fixed past Monday to ensure consistency.
// Example: Jan 3, 2000 was a Monday.
const REFERENCE_MONDAY = new Date(2000, 0, 3, 0, 0, 0, 0); // Month is 0-indexed

const dayOrder = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY, Day.SATURDAY, Day.SUNDAY];

const getDayIndex = (day: Day): number => {
  const index = dayOrder.indexOf(day);
  return index === -1 ? 0 : index;
};

export const convertToDateTime = (dayOfWeek: Day, timeString: string): Date => {
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time string format: ${timeString}`);
  }
  const referenceDate = new Date(REFERENCE_MONDAY);
  
  const dayIndex = getDayIndex(dayOfWeek);
  referenceDate.setDate(REFERENCE_MONDAY.getDate() + dayIndex);
  
  referenceDate.setHours(hours, minutes, 0, 0);
  return referenceDate;
};

export const formatDateTimeToTimeString = (date?: Date | string | null): string => {
    if (!date) return "";
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return "";

        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (error) {
        console.error("Error formatting date to time string:", error);
        return "";
    }
};

const getLatestMonday = (): Date => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const latestMonday = today;
  latestMonday.setDate(today.getDate() - daysSinceMonday);
  return latestMonday;
};

// Define the richer event type used by the calendar components
type ScheduleEvent = {
  title: string;
  start: Date;
  end: Date;
  extendedProps: {
    subject: string;
    className: string;
    teacher: string;
  };
};

export const adjustScheduleToCurrentWeek = (
  lessons: ScheduleEvent[] // Update input type to expect extendedProps
): ScheduleEvent[] => { // Update return type
  const latestMonday = getLatestMonday();

  return lessons.map((lesson) => {
    const lessonDayOfWeek = lesson.start.getDay();
    const daysFromMonday = lessonDayOfWeek === 0 ? 6 : lessonDayOfWeek - 1;
    const adjustedStartDate = new Date(latestMonday);
    adjustedStartDate.setDate(latestMonday.getDate() + daysFromMonday);
    adjustedStartDate.setHours(
      lesson.start.getHours(),
      lesson.start.getMinutes(),
      lesson.start.getSeconds()
    );
    const adjustedEndDate = new Date(adjustedStartDate);
    adjustedEndDate.setHours(
      lesson.end.getHours(),
      lesson.end.getMinutes(),
      lesson.end.getSeconds()
    );

    // Return a new object spreading the original lesson and overriding start/end
    return {
      ...lesson, // Preserve all original properties including extendedProps
      start: adjustedStartDate,
      end: adjustedEndDate,
    };
  });
};
