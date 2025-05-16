"use client";

import { FieldError, UseFormRegister } from "react-hook-form";

interface TextareaFieldProps {
  label: string;
  name: string;
  register: UseFormRegister<any>; // Use UseFormRegister for better type safety if possible
  error?: FieldError;
  id?: string;
  placeholder?: string;
  rows?: number;
  textareaClassName?: string;
  defaultValue?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  // textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
}

const TextareaField: React.FC<TextareaFieldProps> = ({
  label,
  name,
  register,
  error,
  id,
  placeholder,
  rows = 3,
  textareaClassName = "",
  defaultValue,
  wrapperClassName = "flex flex-col gap-2 w-full",
  disabled = false,
  // textareaProps,
}) => {
  const fieldId = id || name;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="text-xs text-gray-500">
        {label}
      </label>
      <textarea
        id={fieldId}
        {...register(name)}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className={`ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed ${textareaClassName}`}
        // {...textareaProps}
      />
      {error?.message && (
        <p className="text-xs text-red-400 mt-1">{error.message.toString()}</p>
      )}
    </div>
  );
};

export default TextareaField; 