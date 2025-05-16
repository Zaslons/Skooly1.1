import { getVerifiedAuthUser, getTeacherAvailability, deleteTeacherAvailability } from "@/lib/actions";
import { redirect } from "next/navigation";
import { TeacherAvailability } from "@prisma/client"; 
import Link from "next/link"; 
import { PlusCircle, Edit3, Trash2, CalendarDays, Clock, AlertTriangle } from "lucide-react";

import TeacherAvailabilityClientPage from "./TeacherAvailabilityClientPage"; 

const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

const groupAvailabilityByDay = (availability: TeacherAvailability[]) => {
  const grouped = availability.reduce((acc, slot) => {
    const day = slot.dayOfWeek;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(slot);
    acc[day].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    return acc;
  }, {} as Record<string, TeacherAvailability[]>);

  return Object.entries(grouped).sort(([dayA], [dayB]) => {
    return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
  });
};


const TeacherAvailabilityPage = async ({ params }: { params: { schoolId: string } }) => {
  const { schoolId } = params;
  const authUser = await getVerifiedAuthUser();

  if (!authUser) {
    redirect("/sign-in?message=Please sign in to view this page.");
    return null; 
  }

  if (authUser.schoolId !== schoolId) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h2 className="mt-2 text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">You are not authorized for this school.</p>
      </div>
    );
  }

  if (authUser.role !== 'teacher' || !authUser.profileId) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h2 className="mt-2 text-xl font-semibold text-gray-700">Access Denied</h2>
        <p className="text-gray-500">This page is for teachers only or teacher profile ID is missing.</p>
      </div>
    );
  }

  const teacherId = authUser.profileId;
  const availabilitySlots = await getTeacherAvailability(teacherId, schoolId);
  
  const groupedSlots = groupAvailabilityByDay(availabilitySlots);

  return (
    <TeacherAvailabilityClientPage
      schoolId={schoolId}
      teacherId={teacherId}
      initialAvailabilitySlots={availabilitySlots} 
      groupedSlots={groupedSlots} 
      deleteAction={deleteTeacherAvailability} 
    />
  );
};

export default TeacherAvailabilityPage; 