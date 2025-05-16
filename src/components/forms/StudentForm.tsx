"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import InputField from "../InputField";
import Image from "next/image";
import { Dispatch, SetStateAction, useEffect, useState } from "react";
import {
  studentSchema,
  StudentSchema,
  teacherSchema,
  TeacherSchema,
} from "@/lib/formValidationSchemas";
import { useFormState } from "react-dom";
import {
  createStudent,
  createTeacher,
  updateStudent,
  updateTeacher,
} from "@/lib/actions";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { CldUploadWidget } from "next-cloudinary";
import Select from "react-select";

const StudentForm = ({
  type,
  data,
  onClose,
  relatedData,
}: {
  type: "create" | "update";
  data?: any;
  onClose: () => void;
  relatedData?: any;
}) => {
  console.log("[StudentForm] Props received - type:", type, "data:", JSON.stringify(data, null, 2));

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue
  } = useForm<StudentSchema>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
        id: data?.id,
        username: data?.username ?? "",
        email: data?.email ?? "",
        password: "",
        name: data?.name ?? "",
        surname: data?.surname ?? "",
        phone: data?.phone ?? "",
        address: data?.address ?? "",
        bloodType: data?.bloodType ?? "",
        sex: data?.sex ?? undefined,
        gradeId: data?.gradeId ? parseInt(String(data.gradeId), 10) : undefined,
        classId: data?.classId ? parseInt(String(data.classId), 10) : undefined,
        parentId: data?.parentId ?? undefined,
        img: data?.img ?? "",
    }
  });

  // Helper function to format date for input type='date'
  const formatDateForInput = (date: string | Date | undefined): string => {
    if (!date) return '';
    try {
      const d = new Date(date);
      // Check if date is valid
      if (isNaN(d.getTime())) return ''; 
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return ''; // Return empty string on error
    }
  };

  const [img, setImg] = useState<any>(data?.img ? { secure_url: data.img } : undefined);

  const [state, formAction] = useFormState(
    type === "create" ? createStudent : updateStudent,
    {
      success: false,
      error: false,
      message: "",
    }
  );

  const onSubmit = handleSubmit((validatedData) => {
    formAction({ ...validatedData, img: img?.secure_url || null });
  });

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(`Student has been ${type === "create" ? "created" : "updated"}!`);
      onClose();
      router.refresh();
    } else if (state.error && state.message) {
      toast.error(state.message);
    }
  }, [state, router, type, onClose]);

  const { grades, classes, parents } = relatedData;

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      {type === 'update' && data?.id && <input type="hidden" {...register("id")} />}

      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new student" : "Update the student"}
      </h1>
      <span className="text-xs text-gray-400 font-medium">
        Authentication Information
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Username"
          name="username"
          register={register}
          error={errors?.username}
        />
        <InputField
          label="Email"
          name="email"
          register={register}
          error={errors?.email}
        />
        <InputField
          label="Password"
          name="password"
          type="password"
          register={register}
          error={errors?.password}
        />
      </div>
      <span className="text-xs text-gray-400 font-medium">
        Personal Information
      </span>
      <CldUploadWidget
        uploadPreset="school"
        onSuccess={(result: any, { widget }) => {
           if (result?.info?.secure_url) {
             setImg(result.info);
             toast.info("Image uploaded successfully!");
           }
          widget.close();
        }}
        onError={(error) => {
            console.error("Cloudinary Upload Error:", error);
            toast.error("Image upload failed. Please try again.");
        }}
      >
        {({ open }) => {
          return (
            <div className="flex items-center gap-2">
              <div
                className="text-xs text-gray-500 flex items-center gap-2 cursor-pointer"
                onClick={() => open()}
              >
                <Image src="/upload.png" alt="" width={28} height={28} />
                <span>Upload a photo</span>
              </div>
              {img?.secure_url && (
                <Image
                  src={img.secure_url}
                  alt="Uploaded image"
                  width={40}
                  height={40}
                  className="rounded object-cover ml-4"
                />
              )}
            </div>
          );
        }}
      </CldUploadWidget>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="First Name"
          name="name"
          register={register}
          error={errors.name}
        />
        <InputField
          label="Last Name"
          name="surname"
          register={register}
          error={errors.surname}
        />
        <InputField
          label="Phone"
          name="phone"
          register={register}
          error={errors.phone}
        />
        <InputField
          label="Address"
          name="address"
          register={register}
          error={errors.address}
        />
        <InputField
          label="Blood Type"
          name="bloodType"
          register={register}
          error={errors.bloodType}
        />
        <InputField
          label="Birthday"
          name="birthday"
          register={register}
          error={errors.birthday}
          type="date"
          defaultValue={formatDateForInput(data?.birthday)}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Parent</label>
          <Controller
            name="parentId"
            control={control}
            rules={{ required: 'Parent is required' }}
            render={({ field }) => (
              <Select
                {...field}
                options={parents?.map((parent: { id: string; name: string; surname: string }) => ({
                  value: parent.id,
                  label: `${parent.name} ${parent.surname}`
                }))}
                value={parents?.map((p: {id: string, name: string, surname: string}) => ({value: p.id, label: `${p.name} ${p.surname}`})).find((p: { value: string; }) => p.value === field.value)}
                onChange={val => field.onChange(val?.value ?? undefined)}
                placeholder="Search for a parent..."
                className="text-sm"
                styles={{
                  control: (base) => ({
                    ...base,
                    borderColor: errors.parentId ? '#f87171' : '#d1d5db',
                    '&:hover': {
                      borderColor: errors.parentId ? '#f87171' : '#9ca3af'
                    }
                  })
                }}
              />
            )}
          />
          {errors.parentId?.message && (
            <p className="text-xs text-red-400">
              {errors.parentId.message.toString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Sex</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("sex")}
          >
            <option value="" disabled>Select Sex</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          {errors.sex?.message && (
            <p className="text-xs text-red-400">
              {errors.sex.message.toString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Grade</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("gradeId")}
          >
            <option value="" disabled>Select Grade</option>
            {grades?.map((grade: { id: number; level: string }) => (
              <option value={grade.id} key={grade.id}>
                {grade.level}
              </option>
            ))}
          </select>
          {errors.gradeId?.message && (
            <p className="text-xs text-red-400">
              {errors.gradeId.message.toString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("classId")}
          >
            <option value="" disabled>Select Class</option>
            {classes?.map(
              (classItem: {
                id: number;
                name: string;
                capacity: number;
                _count: { students: number };
              }) => (
                <option value={classItem.id} key={classItem.id}>
                  {classItem.name} ({classItem._count.students}/{classItem.capacity})
                </option>
              )
            )}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">
              {errors.classId.message.toString()}
            </p>
          )}
        </div>
      </div>
      {state.error && state.message && (
        <span className="text-red-500 text-sm">Error: {state.message}</span>
      )}
      <button type="submit" className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default StudentForm;
