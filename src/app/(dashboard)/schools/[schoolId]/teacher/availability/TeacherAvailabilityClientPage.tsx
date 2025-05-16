"use client";

import { useState, useEffect } from "react";
import { TeacherAvailability, Day } from "@prisma/client";
import { PlusCircle, Edit3, Trash2, CalendarDays, Clock, Info } from "lucide-react";
import FormModal from "@/components/FormModal"; 
import TeacherAvailabilityForm from "@/components/forms/TeacherAvailabilityForm";
import { toast } from "react-toastify";
import { useFormState } from "react-dom"; 
import { useRouter } from 'next/navigation'; // Import useRouter
import { formatDateTimeToTimeString } from "@/lib/utils"; // <--- Added this import


type DeleteAction = (
    currentState: { success: boolean; error: boolean; message?: string },
    formData: FormData
) => Promise<{ success: boolean; error: boolean; message?: string }>;

interface TeacherAvailabilityClientPageProps {
  schoolId: string;
  teacherId: string;
  initialAvailabilitySlots: TeacherAvailability[]; 
  groupedSlots: [string, TeacherAvailability[]][];
  deleteAction: DeleteAction;
  // formatTime: (date?: Date | string) => string; // <--- Removed this prop
}

const TeacherAvailabilityClientPage = ({
  schoolId,
  teacherId,
  initialAvailabilitySlots,
  groupedSlots: initialGroupedSlots, 
  deleteAction,
  // formatTime, // <--- Removed from destructuring
}: TeacherAvailabilityClientPageProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"create" | "update">("create");
  const [currentSlot, setCurrentSlot] = useState<TeacherAvailability | null>(null);
  const [groupedSlots, setGroupedSlots] = useState(initialGroupedSlots);
  const router = useRouter(); // Initialize router

  const [deleteState, deleteFormAction] = useFormState(deleteAction, {
    success: false, error: false, message: ""
  });

  useEffect(() => {
    // This effect handles the result of the delete action
    if (deleteState.success) {
      toast.success(deleteState.message || "Slot deleted successfully!");
      router.refresh(); // Refresh data on successful deletion
    } else if (deleteState.error && deleteState.message) {
      toast.error(deleteState.message);
    }
  }, [deleteState, router]);

  // Update groupedSlots when initialGroupedSlots changes (e.g., after router.refresh())
  useEffect(() => {
    setGroupedSlots(initialGroupedSlots);
  }, [initialGroupedSlots]);

  const openModal = (type: "create" | "update", slotData: TeacherAvailability | null = null) => {
    setModalType(type);
    setCurrentSlot(slotData);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentSlot(null);
    // router.refresh(); // Consider if refresh is needed after any modal close, or only after successful submit
  };

  const handleDelete = async (slotId: string) => {
    if (confirm("Are you sure you want to delete this availability slot?")) {
      const formData = new FormData();
      formData.append("id", slotId);
      // The useEffect hook will handle the response (toast, refresh)
      deleteFormAction(formData); 
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
      <header className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">My Availability</h1>
        <button
          onClick={() => openModal("create")}
          className="mt-3 sm:mt-0 flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-150"
        >
          <PlusCircle size={20} className="mr-2" />
          Add Availability
        </button>
      </header>

      {groupedSlots.length === 0 && (
         <div className="text-center py-10 px-6 bg-white rounded-lg shadow">
            <Info size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No Availability Set</h3>
            <p className="text-gray-500">You haven't added any availability slots yet. Click "Add Availability" to get started.</p>
        </div>
      )}

      <div className="space-y-6">
        {groupedSlots.map(([day, slots]) => (
          <div key={day} className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold text-indigo-700 mb-4 capitalize flex items-center">
                <CalendarDays size={22} className="mr-3 text-indigo-500"/>
                {day.toLowerCase()}
            </h2>
            {slots.length > 0 ? (
              <ul className="space-y-3">
                {slots.map((slot) => (
                  <li
                    key={slot.id}
                    className={`p-3 rounded-md border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                        slot.isAvailable ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex-grow">
                        <div className="flex items-center font-medium text-gray-700">
                            <Clock size={18} className="mr-2 opacity-80" />
                            <span>{formatDateTimeToTimeString(slot.startTime)} - {formatDateTimeToTimeString(slot.endTime)}</span>
                            <span className={`ml-3 px-2 py-0.5 text-xs font-semibold rounded-full ${
                                slot.isAvailable 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-red-100 text-red-700'
                            }`}>
                                {slot.isAvailable ? "Available" : "Unavailable"}
                            </span>
                        </div>
                        {slot.notes && <p className="mt-1 text-xs text-gray-500 pl-7">{slot.notes}</p>}
                    </div>
                    <div className="flex gap-2 mt-2 sm:mt-0 self-end sm:self-center">
                      <button
                        onClick={() => openModal("update", slot)}
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-md transition-colors"
                        title="Edit Slot"
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(slot.id)}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-100 rounded-md transition-colors"
                        title="Delete Slot"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No availability set for this day.</p>
            )}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <FormModal 
            isOpen={isModalOpen} 
            onClose={closeModal} 
        >
          <TeacherAvailabilityForm
            type={modalType}
            data={currentSlot ?? undefined} 
            onClose={closeModal}
          />
        </FormModal>
      )}
    </div>
  );
};

export default TeacherAvailabilityClientPage; 