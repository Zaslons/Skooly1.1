"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import InputField from "../InputField"; // Assuming InputField is in the parent directory
import {
  createRoom, // To be created in @/lib/actions
  updateRoom,   // To be created in @/lib/actions
} from "@/lib/actions";
import { useFormState } from "react-dom";
import { useEffect } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { Room } from "@prisma/client";
import { roomSchema, RoomSchema } from "@/lib/formValidationSchemas"; // Import from central location

interface RoomFormProps {
  type: "create" | "update";
  data?: Partial<Room>; // For pre-filling form in update mode
  onClose: () => void;
  authUser: any; // To pass schoolId if needed, or for authorization in actions
}

const RoomForm = ({ type, data, onClose, authUser }: RoomFormProps) => {
  const schoolId = authUser?.schoolId; // Get schoolId from authUser

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RoomSchema>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      ...data,
      schoolId: data?.schoolId || schoolId, // Ensure schoolId is part of form data
      capacity: data?.capacity || null, // Ensure null if not provided, to match schema
      type: data?.type || null,
      description: data?.description || null,
    },
  });

  const [state, formAction] = useFormState(
    type === "create" ? createRoom : updateRoom,
    {
      success: false,
      error: false,
      message: "",
    }
  );

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(`Room has been ${type === "create" ? "created" : "updated"}!`);
      onClose();
      router.refresh(); // Refresh data on the page
    } else if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  // Add schoolId as a hidden field if it's not part of visible fields but required by action
  // Or ensure it's passed correctly within the action if not from form directly.
  // Here, it's part of defaultValues and schema, so it will be submitted.

  const onSubmit = handleSubmit((formData) => {
    // Ensure capacity is number or undefined, not empty string
    if (formData.capacity === null || formData.capacity === undefined || formData.capacity === '') {
        formData.capacity = undefined;
    } else {
        formData.capacity = Number(formData.capacity);
    }
    formAction(formData);
  });

  return (
    <form className="flex flex-col gap-6 p-1" onSubmit={onSubmit}>
      <h2 className="text-xl font-semibold text-gray-700">
        {type === "create" ? "Create a New Room" : "Update Room Details"}
      </h2>

      {/* Hidden ID field for updates */}
      {type === "update" && data?.id && (
        <input type="hidden" {...register("id")} value={data.id} />
      )}
      
      {/* Hidden schoolId field - ensure it's set */}
      <input type="hidden" {...register("schoolId")} value={data?.schoolId || schoolId} />

      <InputField
        label="Room Name"
        name="name"
        register={register}
        error={errors.name}
        placeholder="e.g., Science Lab 1, Room 101"
        defaultValue={data?.name || ""}
      />

      <InputField
        label="Room Type (Optional)"
        name="type"
        register={register}
        error={errors.type}
        placeholder="e.g., Lab, Classroom, Auditorium"
        defaultValue={data?.type || ""}
      />

      <InputField
        label="Capacity (Optional)"
        name="capacity"
        type="number"
        register={register}
        error={errors.capacity}
        placeholder="e.g., 30"
        defaultValue={data?.capacity || undefined}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-medium text-gray-700">
          Description (Optional)
        </label>
        <textarea
          id="description"
          {...register("description")}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 ring-1 ring-gray-300"
          placeholder="e.g., Contains 20 computers and a projector"
          defaultValue={data?.description || ""}
        />
        {errors.description && (
          <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
        )}
      </div>

      {state.error && state.message && (
        <p className="text-sm text-red-500 mt-2">Error: {state.message}</p>
      )}

      <div className="flex justify-end gap-3 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
        >
          {type === "create" ? "Create Room" : "Save Changes"}
        </button>
      </div>
    </form>
  );
};

export default RoomForm; 