'use client';

import { useState } from 'react';
import FormModal from './FormModal'; // Assuming FormModal is in the same directory
import type { AuthUser } from '@/lib/auth'; // Import AuthUser
import Image from 'next/image';

// Define the specific union type for the 'table' prop, matching FormContainerProps
export type FormTableType = 
  | "teacher"
  | "student"
  | "parent"
  | "subject"
  | "class"
  | "lesson"
  | "exam"
  | "assignment"
  | "result"
  | "attendance"
  | "event"
  | "announcement"
  | "grade"
  | "school";

interface RowFormModalTriggerProps {
  table: FormTableType; // Use the specific union type
  type: 'update' | 'delete';
  itemData?: any; // Data for update, matches what FormModal expects
  itemId?: number;  // ID for delete
  authUser: AuthUser | null; // Pass the authenticated user
  buttonText?: string;
  buttonIcon?: string; // Path to icon image
  buttonClassName?: string;
  // Add any other props FormModal might need directly or via relatedData if not covered
}

const RowFormModalTrigger: React.FC<RowFormModalTriggerProps> = ({
  table,
  type,
  itemData,
  itemId,
  authUser,
  buttonText,
  buttonIcon,
  buttonClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  const defaultButtonClassName = 
    type === 'update' 
      ? "p-1.5 rounded bg-lamaSky text-white hover:bg-lamaSkyDark flex items-center gap-1 text-xs"
      : "p-1.5 rounded bg-lamaPurple text-white hover:bg-lamaPurpleDark flex items-center gap-1 text-xs";

  return (
    <>
      <button onClick={handleOpen} className={buttonClassName || defaultButtonClassName}>
        {buttonIcon && <Image src={buttonIcon} alt={type} width={14} height={14} />}
        {buttonText || (type === 'update' ? 'Edit' : 'Delete')}
      </button>
      {isOpen && (
        <FormModal
          table={table}
          type={type}
          data={itemData} // Pass itemData for update
          id={itemId}     // Pass itemId for delete
          relatedData={{ authUser }} // Pass authUser here
          isOpen={isOpen}
          onClose={handleClose}
          // Pass other props if FormModal expects them directly
          // For example, if FormContainerProps has other mandatory fields not covered by relatedData
          // This might require a closer look at FormContainerProps definition if errors persist
          authUser={authUser} // Passing authUser directly if FormModal/FormContainerProps expects it
        />
      )}
    </>
  );
};

export default RowFormModalTrigger; 