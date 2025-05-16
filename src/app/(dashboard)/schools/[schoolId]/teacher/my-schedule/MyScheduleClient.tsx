"use client";

import { useState } from 'react';
import { TeacherLesson, SchedulePageRelatedData } from "./page"; // Import types from server component
import { AuthUser } from "@/lib/auth";
import { Day } from "@prisma/client";
import { formatDateTimeToTimeString, cn } from "@/lib/utils";
import FormModal from "@/components/FormModal";
import ScheduleChangeRequestForm from "@/components/forms/ScheduleChangeRequestForm"; // To be created
import { Lesson } from "@prisma/client"; // For form data type

interface MyScheduleClientProps {
  initialLessonsByDay: Record<Day, TeacherLesson[]>;
  relatedData: SchedulePageRelatedData;
  authUser: AuthUser; // Assuming AuthUser is not null due to server component checks
  schoolId: string;
}

const MyScheduleClient = ({
  initialLessonsByDay,
  relatedData,
  authUser,
  schoolId,
}: MyScheduleClientProps) => {
  const [lessonsByDay, setLessonsByDay] = useState(initialLessonsByDay);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLessonForRequest, setSelectedLessonForRequest] = useState<TeacherLesson | null>(null);

  const handleOpenModal = (lesson: TeacherLesson) => {
    setSelectedLessonForRequest(lesson);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLessonForRequest(null);
    // Potentially trigger a router.refresh() if a request was made, 
    // or rely on server action revalidation.
  };

  const orderedDays: Day[] = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY, Day.SATURDAY, Day.SUNDAY];

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">My Weekly Schedule</h1>

      <div className="space-y-8">
        {orderedDays.map((day) => (
          lessonsByDay[day] && lessonsByDay[day].length > 0 && (
            <div key={day}>
              <h2 className="text-xl font-medium text-indigo-700 mb-3 capitalize">
                {day.toLowerCase()}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lessonsByDay[day].map((lesson) => (
                  <div key={lesson.id} className="bg-white p-4 rounded-lg shadow hover:shadow-md transition-shadow">
                    <h3 className="text-md font-semibold text-gray-700">{lesson.subject.name}</h3>
                    <p className="text-sm text-gray-500">Class: {lesson.class.name}</p>
                    <p className="text-sm text-gray-500">
                      Time: {formatDateTimeToTimeString(lesson.startTime)} - {formatDateTimeToTimeString(lesson.endTime)}
                    </p>
                    {/* Add more lesson details if needed */}
                    <button 
                      onClick={() => handleOpenModal(lesson)}
                      className="mt-3 w-full text-xs bg-indigo-500 hover:bg-indigo-600 text-white py-1.5 px-3 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                    >
                      Request Change/Swap
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>

      {isModalOpen && selectedLessonForRequest && (
        <FormModal
          table="lesson"
          type="create"
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          authUser={authUser}
        >
          <ScheduleChangeRequestForm 
            lesson={selectedLessonForRequest!}
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