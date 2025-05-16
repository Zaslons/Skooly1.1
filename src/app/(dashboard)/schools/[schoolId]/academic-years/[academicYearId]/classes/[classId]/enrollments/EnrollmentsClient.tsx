'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { enrollStudentAction, unenrollStudentAction } from '@/lib/actions/enrollmentActions'; // Import actual actions
import type { EnrolledStudentWithDetails, StudentForEnrollment } from './page';

// --- Placeholder UI Components (same as CurriculumClient) ---
const FormModal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
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
// --- End Placeholder UI Components ---

interface EnrollmentsClientProps {
  schoolId: string;
  academicYearId: string;
  classId: number; // classId is Int
  initialEnrolledStudents: EnrolledStudentWithDetails[];
  allStudentsInSchool: StudentForEnrollment[];
  initialAcademicYearName: string;
  initialClassName: string;
}

export default function EnrollmentsClient({
  schoolId,
  academicYearId,
  classId,
  initialEnrolledStudents,
  allStudentsInSchool,
  initialAcademicYearName, // For display, if needed
  initialClassName, // For display, if needed
}: EnrollmentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudentWithDetails[]>(initialEnrolledStudents);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [enrollmentDate, setEnrollmentDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default to today YYYY-MM-DD

  useEffect(() => {
    setEnrolledStudents(initialEnrolledStudents);
  }, [initialEnrolledStudents]);

  const openModal = () => {
    setSelectedStudentId(allStudentsInSchool[0]?.id || ''); // Default to first available student
    setEnrollmentDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleEnrollStudent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudentId) {
      toast.error('Please select a student to enroll.');
      return;
    }

    const payload = {
      schoolId,
      academicYearId,
      classId,
      studentId: selectedStudentId,
      enrollmentDate: new Date(enrollmentDate), // Ensure it's a Date object
    };

    startTransition(async () => {
      try {
        const result = await enrollStudentAction(payload);
        if (result.success) {
          toast.success(result.message || 'Student enrolled successfully!');
        } else {
          toast.error(result.message || 'Failed to enroll student.');
          return;
        }
        closeModal();
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to enroll student.');
      }
    });
  };

  const handleUnenrollStudent = async (enrollmentId: string) => {
    if (!window.confirm('Are you sure you want to unenroll this student? This will set their departure date to now.')) return;

    const payload = {
      enrollmentId,
      departureDate: new Date(),
      schoolId,      // Pass for auth and revalidation
      academicYearId,// Pass for revalidation
      classId,       // Pass for revalidation
    };

    startTransition(async () => {
      try {
        const result = await unenrollStudentAction(payload);
        if (result.success) {
          toast.success(result.message || 'Student unenrolled successfully!');
        } else {
          toast.error(result.message || 'Failed to unenroll student.');
          return;
        }
        router.refresh();
      } catch (error: any) {
        toast.error(error.message || 'Failed to unenroll student.');
      }
    });
  };

  return (
    <div>
      <div className="mb-4">
        <Button onClick={openModal} variant="primary" disabled={isPending}>
          Enroll New Student
        </Button>
      </div>

      {/* Table to display enrolled students */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled On</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isPending && enrolledStudents.length === 0 && (
                 <tr><td colSpan={4} className="p-4 text-center text-gray-500">Loading...</td></tr>
            )}
            {!isPending && enrolledStudents.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                  No students currently enrolled in this class for this academic year.
                </td>
              </tr>
            )}
            {enrolledStudents.map((enrollment) => (
              <tr key={enrollment.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {enrollment.student.name} {enrollment.student.surname}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{enrollment.student.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(enrollment.enrollmentDate).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <Button onClick={() => handleUnenrollStudent(enrollment.id)} variant="danger" size="sm" disabled={isPending}>
                    Unenroll
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal for Enroll New Student */}
      <FormModal
        isOpen={isModalOpen}
        onClose={closeModal}
        title="Enroll New Student"
      >
        <form onSubmit={handleEnrollStudent}>
          <div className="mb-4">
            <label htmlFor="studentId" className="block text-sm font-medium text-gray-700">Student</label>
            <select
              id="studentId"
              name="studentId"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              required
            >
              <option value="" disabled>Select a student</option>
              {allStudentsInSchool.map(student => (
                <option key={student.id} value={student.id}>
                  {student.surname}, {student.name} ({student.email})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label htmlFor="enrollmentDate" className="block text-sm font-medium text-gray-700">Enrollment Date</label>
            <input
              type="date"
              id="enrollmentDate"
              name="enrollmentDate"
              value={enrollmentDate}
              onChange={(e) => setEnrollmentDate(e.target.value)}
              disabled={isPending}
              className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
              required
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" onClick={closeModal} variant="secondary" disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? 'Enrolling...' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
} 