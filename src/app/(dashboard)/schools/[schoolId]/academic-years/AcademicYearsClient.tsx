'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation'; // For query param handling
import { toast } from 'react-toastify'; // Assuming toastify is used
// import { PlusIcon, EditIcon, ArchiveIcon, EyeIcon, EyeOffIcon, CheckCircleIcon } from '@heroicons/react/outline'; // Example icons

import { 
  createAcademicYearAction, 
  updateAcademicYearAction,
  archiveAcademicYearAction,
  unarchiveAcademicYearAction,
  setActiveAcademicYearAction
} from '@/lib/actions/academicYearActions';

// Basic type for AcademicYear - align with Prisma model
interface AcademicYear {
  id: string;
  name: string;
  startDate: string; // Keep as string for simplicity from JSON serialization
  endDate: string;   // Keep as string
  isActive: boolean;
  isArchived: boolean;
  schoolId: string;
  // activeSchoolAcademicYearId is not part of AY, but passed to client
}

interface AcademicYearsClientProps {
  schoolId: string;
  initialAcademicYears: AcademicYear[];
  activeSchoolAcademicYearId: string | null; // The ID of the school's currently active AY
}

// Placeholder for a Modal component - you'll need to have one or build one
// For now, we'll just simulate its presence
const FormModal = ({ isOpen, onClose, onSubmit, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {children}
        {/* Buttons would be part of the form passed as children or specific modal actions */}
      </div>
    </div>
  );
};

// Placeholder for a Button component
const Button = ({ onClick, children, variant = 'primary', ...props }: any) => {
  const baseStyle = "px-4 py-2 rounded font-semibold text-sm";
  const variants: { [key: string]: string } = {
    primary: "bg-blue-500 hover:bg-blue-600 text-white",
    secondary: "bg-gray-200 hover:bg-gray-300 text-gray-700",
    danger: "bg-red-500 hover:bg-red-600 text-white",
    outline: "border border-gray-300 hover:bg-gray-100 text-gray-700",
  };
  return <button onClick={onClick} className={`${baseStyle} ${variants[variant]}`} {...props}>{children}</button>;
}


export default function AcademicYearsClient({ schoolId, initialAcademicYears, activeSchoolAcademicYearId }: AcademicYearsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(initialAcademicYears);
  const [isPending, startTransition] = useTransition();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentAcademicYear, setCurrentAcademicYear] = useState<Partial<AcademicYear> | null>(null);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const showArchived = searchParams.get('includeArchived') === 'true';

  // Update state if initial props change (e.g. due to navigation for showArchived)
  useEffect(() => {
    setAcademicYears(initialAcademicYears);
  }, [initialAcademicYears]);

  const handleToggleShowArchived = () => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (showArchived) {
      current.delete('includeArchived');
    } else {
      current.set('includeArchived', 'true');
    }
    const query = current.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`);
    // Data fetching is handled by page.tsx reload
  };

  const openModal = (mode: 'create' | 'edit', ay: AcademicYear | null = null) => {
    setModalMode(mode);
    if (mode === 'edit' && ay) {
      setCurrentAcademicYear(ay);
      setName(ay.name);
      // Format dates for input type="date" (YYYY-MM-DD)
      setStartDate(new Date(ay.startDate).toISOString().split('T')[0]);
      setEndDate(new Date(ay.endDate).toISOString().split('T')[0]);
    } else {
      setCurrentAcademicYear(null);
      setName('');
      setStartDate('');
      setEndDate('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentAcademicYear(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Basic validation
    if (!name || !startDate || !endDate) {
      toast.error('Please fill all fields.');
      return;
    }
    if (new Date(startDate) >= new Date(endDate)) {
      toast.error('Start date must be before end date.');
      return;
    }

    const academicYearData = {
      name,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      schoolId: schoolId, // Important: ensure schoolId is part of the data for creation
    };

    startTransition(async () => {
      try {
        if (modalMode === 'create') {
          const result = await createAcademicYearAction(academicYearData);
          if (result.success) toast.success(result.message);
        } else if (currentAcademicYear && currentAcademicYear.id) {
          const updatePayload = { name, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString() };
          const result = await updateAcademicYearAction(currentAcademicYear.id, updatePayload);
          if (result.success) toast.success(result.message);
        }
        closeModal();
        router.refresh(); // Re-fetch server component data
      } catch (error: any) {
        console.error('Failed to save academic year:', error);
        toast.error(error.message || 'Failed to save academic year.');
      }
    });
  };

  const handleSetActive = async (ayId: string) => {
    if (activeSchoolAcademicYearId === ayId) {
        toast.info("This academic year is already active.");
        return;
    }
    if (!confirm('Are you sure you want to set this academic year as active? This will deactivate any other active year.')) return;
    startTransition(async () => {
      try {
        const result = await setActiveAcademicYearAction(ayId, schoolId);
        if (result.success) toast.success(result.message);
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to set active academic year.');
      }
    });
  };

  const handleToggleArchive = async (ay: AcademicYear) => {
    const actionText = ay.isArchived ? 'unarchive' : 'archive';
    if (!confirm(`Are you sure you want to ${actionText} this academic year?`)) return;
    
    startTransition(async () => {
      try {
        if (ay.isArchived) {
          const result = await unarchiveAcademicYearAction(ay.id);
          if (result.success) toast.success(result.message);
        } else {
          const result = await archiveAcademicYearAction(ay.id);
          if (result.success) toast.success(result.message);
        }
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || `Failed to ${actionText} academic year.`);
      }
    });
  };

  // Function to determine status text
  const getStatusText = (ay: AcademicYear) => {
    if (ay.isArchived) return "Archived";
    if (activeSchoolAcademicYearId === ay.id) return "Active"; // Use prop passed from server
    // Add more sophisticated logic for "Past", "Upcoming" based on dates if needed
    const today = new Date();
    const startDate = new Date(ay.startDate);
    const endDate = new Date(ay.endDate);
    if (endDate < today) return "Past";
    if (startDate > today) return "Upcoming";
    return "Current (Not Active)"; // If within dates but not the *school's* active AY
  };


  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <Button onClick={() => openModal('create')} variant="primary">
          {/* <PlusIcon className="h-5 w-5 mr-2" /> */}
          Add New Academic Year
        </Button>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="showArchived"
            checked={showArchived}
            onChange={handleToggleShowArchived}
            className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="showArchived" className="text-sm text-gray-700">Show Archived</label>
        </div>
      </div>

      {/* Table to display academic years */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isPending && academicYears.length === 0 && (
                <tr><td colSpan={5} className="p-4 text-center text-gray-500">Loading...</td></tr>
            )}
            {!isPending && academicYears.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                  No academic years found. {showArchived ? "" : "Try showing archived ones."}
                </td>
              </tr>
            )}
            {academicYears.map((ay) => (
              <tr key={ay.id} className={`${ay.isArchived ? 'bg-gray-100 opacity-70' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ay.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(ay.startDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(ay.endDate).toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ay.isArchived ? 'bg-gray-100 text-gray-800' : activeSchoolAcademicYearId === ay.id ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {getStatusText(ay)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  {!ay.isArchived && (
                    <>
                      <Button onClick={() => openModal('edit', ay)} variant="outline" className="text-indigo-600 hover:text-indigo-900">
                        Edit
                      </Button>
                      {activeSchoolAcademicYearId !== ay.id && (
                        <Button onClick={() => handleSetActive(ay.id)} variant="outline" className="text-green-600 hover:text-green-900">
                          Set Active
                        </Button>
                      )}
                      <Button 
                        onClick={() => router.push(`/schools/${schoolId}/academic-years/${ay.id}/curriculum`)}
                        variant="outline"
                        className="text-purple-600 hover:text-purple-900"
                      >
                        Curriculum
                      </Button>
                      <Button 
                        onClick={() => router.push(`/schools/${schoolId}/academic-years/${ay.id}/classes`)}
                        variant="outline"
                        className="text-teal-600 hover:text-teal-900"
                      >
                        Classes
                      </Button>
                    </>
                  )}
                  <Button onClick={() => handleToggleArchive(ay)} variant="outline" className={ay.isArchived ? "text-yellow-600 hover:text-yellow-900" : "text-red-600 hover:text-red-900"}>
                    {ay.isArchived ? 'Unarchive' : 'Archive'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Create/Edit */}
      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Create Academic Year' : 'Edit Academic Year'}
      >
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Start Date</label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">End Date</label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
              disabled={isPending}
            />
          </div>
          <div className="mt-6 flex justify-end space-x-2">
            <Button type="button" onClick={closeModal} variant="secondary" disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? (modalMode === 'create' ? 'Creating...' : 'Saving...') : (modalMode === 'create' ? 'Create' : 'Save Changes')}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
} 