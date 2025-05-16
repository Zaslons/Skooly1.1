'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
// Import server actions
import { createCurriculumAction, updateCurriculumAction, deleteCurriculumAction } from '@/lib/actions/curriculumActions';
import type { AcademicYear, Grade, Subject } from '@prisma/client';
import type { CurriculumWithRelations } from './page'; // Import the type from page.tsx

// Using placeholders for Modal and Button, assuming they exist from AcademicYearsClient or similar
// You should replace these with your actual UI components.
const FormModal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg"> {/* Increased max-width for more fields */}
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
};
const Button = ({ onClick, children, variant = 'primary', disabled, type, ...props }: any) => {
  const baseStyle = "px-4 py-2 rounded font-semibold text-sm disabled:opacity-50";
  const variants: { [key: string]: string } = {
    primary: "bg-blue-500 hover:bg-blue-600 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-700",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    outline: "border border-gray-300 hover:bg-gray-100 text-gray-700",
  };
  return <button onClick={onClick} type={type} disabled={disabled} className={`${baseStyle} ${variants[variant]}`} {...props}>{children}</button>;
};


interface CurriculumClientProps {
  schoolId: string;
  academicYearId: string;
  initialAcademicYear: AcademicYear;
  initialCurriculumEntries: CurriculumWithRelations[];
  gradesForSchool: Grade[];
  subjectsForSchool: Subject[];
}

export default function CurriculumClient({
  schoolId,
  academicYearId,
  initialAcademicYear,
  initialCurriculumEntries,
  gradesForSchool,
  subjectsForSchool,
}: CurriculumClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [curriculumEntries, setCurriculumEntries] = useState<CurriculumWithRelations[]>(initialCurriculumEntries);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentCurriculumEntry, setCurrentCurriculumEntry] = useState<CurriculumWithRelations | null>(null);

  // Form state
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [textbook, setTextbook] = useState<string>('');

  useEffect(() => {
    setCurriculumEntries(initialCurriculumEntries);
  }, [initialCurriculumEntries]);

  const openModal = (mode: 'create' | 'edit', entry: CurriculumWithRelations | null = null) => {
    setModalMode(mode);
    if (mode === 'edit' && entry) {
      setCurrentCurriculumEntry(entry);
      setSelectedGradeId(String(entry.gradeId));
      setSelectedSubjectId(String(entry.subjectId));
      setDescription(entry.description || '');
      setTextbook(entry.textbook || '');
    } else {
      setCurrentCurriculumEntry(null);
      setSelectedGradeId(gradesForSchool[0]?.id ? String(gradesForSchool[0].id) : '');
      setSelectedSubjectId(subjectsForSchool[0]?.id ? String(subjectsForSchool[0].id) : '');
      setDescription('');
      setTextbook('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentCurriculumEntry(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (modalMode === 'create' && (!selectedGradeId || !selectedSubjectId)) {
      toast.error('Please select a grade and a subject.');
      return;
    }

    const payload = {
      schoolId, // Needed for create validation in action
      academicYearId,
      gradeId: selectedGradeId,
      subjectId: selectedSubjectId,
      description,
      textbook,
    };
    
    const editPayload = { description, textbook };

    startTransition(async () => {
      try {
        if (modalMode === 'create') {
          const result = await createCurriculumAction(payload);
          if (result.success) {
            toast.success(result.message || 'Curriculum entry created!');
          } else {
            // In case the action throws an error or returns success: false without a specific message
            toast.error(result.message || 'Failed to create curriculum entry.');
            return; // Prevent closing modal and refreshing if creation failed
          }
        } else if (currentCurriculumEntry) {
          const result = await updateCurriculumAction(currentCurriculumEntry.id, editPayload);
          if (result.success) {
            toast.success(result.message || 'Curriculum entry updated!');
          } else {
            toast.error(result.message || 'Failed to update curriculum entry.');
            return; // Prevent closing modal and refreshing if update failed
          }
        }
        closeModal();
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to save curriculum entry.');
      }
    });
  };

  const handleDelete = async (curriculumId: string) => {
    if (!window.confirm('Are you sure you want to delete this curriculum entry? This action cannot be undone.')) return;

    startTransition(async () => {
      try {
        const result = await deleteCurriculumAction({ curriculumId, schoolId, academicYearId });
        if (result.success) {
          toast.success(result.message || 'Curriculum entry deleted!');
        } else {
          toast.error(result.message || 'Failed to delete curriculum entry.');
          return; // Prevent refreshing if deletion failed
        }
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to delete curriculum entry.');
      }
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Button onClick={() => openModal('create')} variant="primary" disabled={isPending}>
          Add Curriculum Entry
        </Button>
      </div>

      {/* Table to display curriculum entries */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Textbook</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isPending && curriculumEntries.length === 0 && (
                 <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
            )}
            {!isPending && curriculumEntries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                  No curriculum entries found for this academic year.
                </td>
              </tr>
            )}
            {curriculumEntries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{entry.grade.level}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.subject.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">{entry.description}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">{entry.textbook}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <Button onClick={() => openModal('edit', entry)} variant="outline" size="sm" disabled={isPending}>
                    Edit
                  </Button>
                  <Button onClick={() => handleDelete(entry.id)} variant="danger" size="sm" disabled={isPending}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Create/Edit Curriculum Entry */}
      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Add Curriculum Entry' : 'Edit Curriculum Entry'}
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
            <div>
              <label htmlFor="gradeId" className="block text-sm font-medium text-gray-700">Grade</label>
              <select
                id="gradeId"
                name="gradeId"
                value={selectedGradeId}
                onChange={(e) => setSelectedGradeId(e.target.value)}
                disabled={isPending || modalMode === 'edit'} // Grade/Subject usually not editable once created
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
                required={modalMode === 'create'}
              >
                <option value="" disabled={modalMode === 'create'}>Select a grade</option>
                {gradesForSchool.map(grade => (
                  <option key={grade.id} value={String(grade.id)}>{grade.level}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subjectId" className="block text-sm font-medium text-gray-700">Subject</label>
              <select
                id="subjectId"
                name="subjectId"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={isPending || modalMode === 'edit'} // Grade/Subject usually not editable once created
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md disabled:bg-gray-100"
                required={modalMode === 'create'}
              >
                <option value="" disabled={modalMode === 'create'}>Select a subject</option>
                {subjectsForSchool.map(subject => (
                  <option key={subject.id} value={String(subject.id)}>{subject.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description (Optional)</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="textbook" className="block text-sm font-medium text-gray-700">Textbook/Resources (Optional)</label>
            <input
              type="text"
              id="textbook"
              name="textbook"
              value={textbook}
              onChange={(e) => setTextbook(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
            />
          </div>

          <div className="mt-6 flex justify-end space-x-2">
            <Button type="button" onClick={closeModal} variant="secondary" disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (modalMode === 'create' ? 'Adding...' : 'Saving...') : (modalMode === 'create' ? 'Add Entry' : 'Save Changes')}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
} 