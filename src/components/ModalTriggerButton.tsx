'use client';

import { useState } from 'react';
import Image from 'next/image';
import FormModal from './FormModal';
import { FormContainerProps } from './FormContainer'; // Reuse props type
import type { AuthUser } from '@/lib/auth'; // Ensure AuthUser is imported if not already via FormContainerProps

// Extend props to include relatedData, removing isOpen/onClose as they are internal now
// authUser will be inherited from FormContainerProps
interface ModalTriggerButtonProps extends Omit<FormContainerProps, 'isOpen' | 'onClose'> {
  relatedData?: any; // relatedData is already part of FormContainerProps, but can be kept for clarity if needed
}

const ModalTriggerButton = ({ 
  table, 
  type, 
  data, 
  id, 
  relatedData, 
  authUser // Destructure authUser
}: ModalTriggerButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = () => {
    setIsOpen(true);
    // Optional: For debugging, log here when the modal is opened
    // console.log("[ModalTriggerButton] Opening FormModal with data:", JSON.stringify(data, null, 2));
    // console.log("[ModalTriggerButton] authUser:", authUser);
  };
  const handleClose = () => setIsOpen(false);

  // Determine button style based on type
  const buttonContent = () => {
    switch (type) {
      case 'create':
        return (
          <button 
            className="bg-lamaYellow text-black px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium hover:bg-amber-400"
            onClick={handleOpen}
          >
            <Image src="/add.png" alt="" width={16} height={16} />
            Add New {table.charAt(0).toUpperCase() + table.slice(1)}
          </button>
        );
      case 'update':
        return (
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky hover:bg-sky-300" 
            onClick={handleOpen}
            title={`Update ${table}`}
          >
            <Image src="/update.png" alt="Update" width={14} height={14} />
          </button>
        );
      case 'delete':
        return (
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaPurple hover:bg-purple-400" 
            onClick={handleOpen}
            title={`Delete ${table}`}
            >
            <Image src="/delete.png" alt="Delete" width={14} height={14} />
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {buttonContent()}
      {/* Render FormModal conditionally, controlled by internal state */}
      {/* Removed problematic console.log from JSX */}
      <FormModal
        table={table}
        type={type}
        data={data}
        id={id}
        relatedData={relatedData}
        isOpen={isOpen}      // Use internal state
        onClose={handleClose} // Use internal handler
        authUser={authUser}   // Pass authUser directly
      />
    </>
  );
};

export default ModalTriggerButton; 