"use client";

import { FieldError, UseFormRegister } from "react-hook-form";

type Option = {
  value: string | number;
  label: string;
};

interface SelectFieldProps {
  label: string;
  name: string;
  register: UseFormRegister<any>; // Use UseFormRegister for better type safety if possible
  options: Option[];
  error?: FieldError;
  id?: string;
  placeholder?: string;
  selectClassName?: string;
  defaultValue?: string | number;
  wrapperClassName?: string;
  disabled?: boolean;
  // Add any other props you might need for the select element itself
  // selectProps?: React.SelectHTMLAttributes<HTMLSelectElement>;
}

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  name,
  register,
  options,
  error,
  id,
  placeholder,
  selectClassName = "",
  defaultValue,
  wrapperClassName = "flex flex-col gap-2 w-full",
  disabled = false,
  // selectProps,
}) => {
  const fieldId = id || name;

  return (
    <div className={wrapperClassName}>
      <label htmlFor={fieldId} className="text-xs text-gray-500">
        {label}
      </label>
      <select
        id={fieldId}
        {...register(name)}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm bg-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed ${selectClassName}`}
        // {...selectProps}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error?.message && (
        <p className="text-xs text-red-400 mt-1">{error.message.toString()}</p>
      )}
    </div>
  );
};

export default SelectField; 