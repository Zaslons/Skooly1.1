"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { adminSchema } from "@/lib/formValidationSchemas";
import type { z } from "zod";
import { toast } from "react-toastify";
import { useEffect } from "react";
import { updateAdmin } from "@/lib/actions"; // Uncommented, assuming it will be created
import InputField from "@/components/InputField"; // Assuming InputField component exists

export type AdminFormData = z.infer<typeof adminSchema>;

interface AdminFormProps {
  type: "create" | "update";
  data?: AdminFormData & { email?: string | null }; // email might come from Auth record initially
  onClose: () => void;
  currentAuthEmail?: string | null; // Pass current auth email to compare
}

const AdminForm = ({ type, data, onClose, currentAuthEmail }: AdminFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch
  } = useForm<AdminFormData>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      id: data?.id,
      username: data?.username ?? "",
      name: data?.name ?? "",
      surname: data?.surname ?? "",
      phone: data?.phone ?? "",
      img: data?.img ?? "",
      email: data?.email ?? currentAuthEmail ?? "", // Initialize with current auth email if available
      password: "",
      confirmPassword: "",
    },
  });

  const watchedPassword = watch("password");

  // Populate form with data when it changes (e.g., when modal opens with existing data)
  useEffect(() => {
    if (data) {
      setValue("id", data.id);
      setValue("username", data.username ?? "");
      setValue("name", data.name ?? "");
      setValue("surname", data.surname ?? "");
      setValue("phone", data.phone ?? "");
      setValue("img", data.img ?? "");
      // Use currentAuthEmail for initial email value if data.email (from Admin profile) is not set
      setValue("email", data.email ?? currentAuthEmail ?? "");
    }
  }, [data, setValue, currentAuthEmail]);

  const onSubmit = async (formData: AdminFormData) => {
    try {
      console.log("Admin form submitted:", formData);

      // Prepare data for the action
      const dataToUpdate: AdminFormData = {
        ...formData,
        username: formData.username === "" ? undefined : formData.username,
        email: formData.email === "" ? undefined : formData.email, // Send undefined if email is empty
        password: formData.password === "" ? undefined : formData.password, // Send undefined if password is empty
      };
      // Omit confirmPassword as it's not part of the Admin record itself
      if (dataToUpdate.confirmPassword === "" || dataToUpdate.password === undefined) {
        delete dataToUpdate.confirmPassword;
      }

      const result = await updateAdmin(dataToUpdate); 
      if (result.success) {
        toast.success(result.message || "Admin profile updated successfully!");
        onClose();
      } else {
        toast.error(result.message || "Failed to update admin profile.");
      }
    } catch (error) {
      console.error("Error updating admin profile:", error);
      toast.error("An unexpected error occurred while updating admin profile.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-1">
      <h1 className="text-xl font-semibold">
        {type === "update" ? "Update Admin Profile" : "Create Admin"} 
      </h1>
      {data?.id && <input type="hidden" {...register("id")} />}

      <InputField label="Username (Profile)" name="username" register={register} error={errors.username} />
      <InputField label="First Name" name="name" register={register} error={errors.name} />
      <InputField label="Last Name" name="surname" register={register} error={errors.surname} />
      <InputField label="Email (Login)" name="email" type="email" register={register} error={errors.email} />
      <InputField label="Phone (Optional)" name="phone" type="tel" register={register} error={errors.phone} />
      <InputField label="Image URL (Optional)" name="img" type="url" register={register} error={errors.img} inputProps={{ placeholder: "https://example.com/image.png" }} />
      
      <div className="border-t pt-4 mt-4">
        <p className="text-sm text-gray-600 mb-2">Update Password (leave blank to keep current)</p>
        <InputField label="New Password" name="password" type="password" register={register} error={errors.password} />
        <InputField label="Confirm New Password" name="confirmPassword" type="password" register={register} error={errors.confirmPassword} 
          inputProps={{ disabled: !watchedPassword }} // Disable if password field is empty
        />
      </div>
      
      <div className="flex justify-end space-x-3 pt-4">
        <button 
          type="button" 
          onClick={onClose} 
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : (type === "update" ? "Update Admin" : "Create Admin")}
        </button>
      </div>
    </form>
  );
};

export default AdminForm; 