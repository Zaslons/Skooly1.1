"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import InputField from "../InputField";
import { assignmentSchema, AssignmentSchema } from "@/lib/formValidationSchemas";
import { createAssignment, updateAssignment, previewAssignmentDueDateAction } from "@/lib/actions";
import { useFormState } from "react-dom";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { Day } from "@prisma/client";

type LessonOption = {
  id: number;
  name: string;
  classId: number;
  subjectId: number;
  day: Day;
  startTime: Date | string;
  class?: { name: string };
  subject?: { name: string };
};

const AssignmentForm = ({
  type,
  data,
  onClose,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  onClose: () => void;
  relatedData?: {
    lessons?: LessonOption[];
    dueLessons?: LessonOption[];
    schoolId?: string;
  };
}) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AssignmentSchema>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: data?.title ?? "",
      startDate: data?.startDate ? new Date(data.startDate) : undefined,
      dueDate: data?.dueDate ? new Date(data.dueDate) : undefined,
      lessonId: data?.lessonId ?? (data?.lesson?.id ?? ""),
      dueLessonId: data?.dueLessonId ?? (data?.lessonId ?? data?.lesson?.id ?? ""),
      id: data?.id ?? undefined,
      maxScore: data?.maxScore ?? 100,
      weight: data?.weight ?? 1.0,
    },
  });

  const lessonId = useWatch({ control, name: "lessonId" });
  const dueLessonId = useWatch({ control, name: "dueLessonId" });
  const startDate = useWatch({ control, name: "startDate" });

  const { lessons = [], dueLessons = [], schoolId } = relatedData || {};

  const sourceLesson = useMemo(() => {
    const id = Number(lessonId);
    if (!Number.isFinite(id)) return null;
    return lessons.find((l) => l.id === id) ?? null;
  }, [lessons, lessonId]);

  const filteredDueLessons = useMemo(() => {
    if (!sourceLesson) return dueLessons;
    return dueLessons.filter((l) => l.classId === sourceLesson.classId);
  }, [dueLessons, sourceLesson]);

  const [duePreviewIso, setDuePreviewIso] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const sid = schoolId;
      const dl = Number(dueLessonId);
      if (!sid || !Number.isFinite(dl) || !startDate) {
        setDuePreviewIso(null);
        return;
      }
      const res = await previewAssignmentDueDateAction(sid, dl, startDate.toISOString());
      if (res.ok) setDuePreviewIso(res.iso);
      else setDuePreviewIso(null);
    };
    void run();
  }, [schoolId, dueLessonId, startDate]);

  const [state, formAction] = useFormState(
    type === "create" ? createAssignment : updateAssignment,
    {
      success: false,
      error: false,
    }
  );

  const onSubmit = handleSubmit((data) => {
    formAction(data);
  });

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(
        `Assignment has been ${type === "create" ? "created" : "updated"}!`
      );
      onClose();
      router.refresh();
    } else if (state.error && "message" in state && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new assignment" : "Update the assignment"}
      </h1>
      <p className="text-sm text-gray-600 -mt-4">
        Pick the <strong>due lesson</strong> (same class as the source lesson). The stored due date is computed from
        that lesson&apos;s weekly slot within the active term.
      </p>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Assignment title"
          name="title"
          defaultValue={data?.title}
          register={register}
          error={errors?.title}
        />

        <InputField
          label="Start Date"
          name="startDate"
          defaultValue={data?.startDate}
          register={register}
          error={errors?.startDate}
          type="datetime-local"
        />

        <InputField
          label="Max Score"
          name="maxScore"
          defaultValue={data?.maxScore ?? 100}
          register={register}
          error={errors?.maxScore}
          type="number"
        />
        <InputField
          label="Weight"
          name="weight"
          defaultValue={data?.weight ?? 1.0}
          register={register}
          error={errors?.weight}
          type="number"
        />

        {data && (
          <InputField
            label="Id"
            name="id"
            defaultValue={data?.id}
            register={register}
            error={errors?.id}
            hidden
          />
        )}

        <div className="flex flex-col gap-2 w-full md:w-1/3">
          <label className="text-xs text-gray-500">Source lesson (context)</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("lessonId")}
            defaultValue={data?.lessonId ?? ""}
          >
            <option value="">Select source lesson</option>
            {lessons.map((lesson) => (
              <option value={lesson.id} key={lesson.id}>
                {lesson.name}
                {lesson.class?.name ? ` · ${lesson.class.name}` : ""}
              </option>
            ))}
          </select>
          {errors.lessonId?.message && (
            <p className="text-xs text-red-400">
              {errors.lessonId.message.toString()}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/3">
          <label className="text-xs text-gray-500">Due lesson (same class)</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("dueLessonId")}
            defaultValue={data?.dueLessonId ?? data?.lessonId ?? ""}
          >
            <option value="">Select due lesson</option>
            {filteredDueLessons.map((lesson) => (
              <option value={lesson.id} key={lesson.id}>
                {lesson.name}
                {lesson.subject?.name ? ` · ${lesson.subject.name}` : ""}
              </option>
            ))}
          </select>
          {errors.dueLessonId?.message && (
            <p className="text-xs text-red-400">
              {errors.dueLessonId.message.toString()}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-slate-50 p-3 text-sm">
        <span className="font-medium text-gray-700">Computed due (from due lesson + term): </span>
        {duePreviewIso ? (
          <span className="text-gray-900">
            {new Date(duePreviewIso).toLocaleString()}
          </span>
        ) : (
          <span className="text-gray-500">Select due lesson and start date to preview.</span>
        )}
      </div>

      {state.error && !("message" in state && state.message) && (
        <span className="text-red-500">Something went wrong!</span>
      )}

      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AssignmentForm;
