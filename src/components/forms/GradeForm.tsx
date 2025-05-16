"use client";

import { createGrade, updateGrade } from "@/lib/actions";
import { GradeSchema } from "@/lib/formValidationSchemas";
import { Grade } from "@prisma/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dispatch, SetStateAction, useEffect } from "react";
import { useFormState } from "react-dom";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import InputField from "../InputField";
import { useRouter } from "next/navigation";

interface GradeFormProps {
  type: "create" | "update";
  data?: Grade;
  onClose: () => void;
}

const GradeForm = ({ type, data, onClose }: GradeFormProps) => {
  const action = type === "create" ? createGrade : updateGrade;
  const [state, formAction] = useFormState(action, { success: false, error: false, message: "" });
  const router = useRouter();

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<GradeSchema>({
    resolver: zodResolver(GradeSchema),
    defaultValues: {
      id: data?.id,
      level: data?.level || undefined,
    },
  });

  useEffect(() => {
    if (state.success) {
      toast.success(`Grade has been ${type === "create" ? "created" : "updated"}!`);
      onClose();
      router.refresh();
    } else if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold capitalize">
        {type} Grade
      </h1>
      <hr />
      <InputField
        label="Grade Level"
        name="level"
        type="text"
        register={register}
        error={errors.level}
      />
      {type === "update" && data?.id && (
        <input type="hidden" {...register("id")} value={data.id} />
      )}
      <button
        type="submit"
        className="bg-lamaPurple hover:bg-lamaPurpleLight text-white py-2 px-4 rounded-md border-none w-max self-end capitalize"
      >
        {type}
      </button>
    </form>
  );
};

export default GradeForm; 