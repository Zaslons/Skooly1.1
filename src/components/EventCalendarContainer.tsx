import Image from "next/image";
import EventCalendar from "./EventCalendar";
import EventList from "./EventList";

const EventCalendarContainer = async ({
  searchParams,
  schoolId
}: {
  searchParams: { [keys: string]: string | undefined };
  schoolId: string;
}) => {
  if (!schoolId) {
    console.error("SchoolId is required for EventCalendarContainer.");
    return <div className="bg-white p-4 rounded-md">Error: Missing School ID</div>;
  }

  const { date } = searchParams;
  return (
    <div className="bg-white p-4 rounded-md">
      <EventCalendar />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold my-4">Events</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>
      <div className="flex flex-col gap-4">
        <EventList dateParam={date} schoolId={schoolId} />
      </div>
    </div>
  );
};

export default EventCalendarContainer;
