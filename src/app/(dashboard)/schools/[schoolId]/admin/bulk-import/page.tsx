'use client';

import BulkImportCard from '@/components/admin/BulkImportCard';
import { bulkCreateStudents, bulkCreateTeachers, bulkCreateResults } from '@/lib/actions';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'react-toastify';
import type { AuthUser } from '@/lib/auth';
import Image from 'next/image'; // For loading state

const BulkImportPage = () => {
    // const { user } = useUser(); // Removed Clerk
    // const role = user?.publicMetadata?.role as string; // Removed Clerk

    const router = useRouter();
    const params = useParams();
    const schoolIdFromParams = params?.schoolId as string;

    const [authUser, setAuthUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        if (!schoolIdFromParams) {
            // This can happen if params are not available immediately
            // Or if the component is somehow rendered outside its expected route context
            setIsLoading(false);
            setAccessDenied(true);
            toast.error("School information is missing.");
            return;
        }

        const fetchUser = async () => {
            try {
                const response = await fetch('/api/auth/me');
                if (response.ok) {
                    const user: AuthUser = await response.json();
                    setAuthUser(user);

                    if (user.schoolId !== schoolIdFromParams) {
                        toast.error("Access Denied: You do not have permission for this school.");
                        setAccessDenied(true);
                        // Optionally redirect to a safe page, e.g., user's own school dashboard or home
                        // router.push(user.schoolId ? `/schools/${user.schoolId}/${user.role}` : '/');
                    } else if (user.role !== 'admin') {
                        // Non-admins can only see the results import, or nothing if we choose so.
                        // The existing conditional rendering for student/teacher cards handles this for now.
                        // If we want to deny access to the page entirely for non-admins:
                        // toast.error("Access Denied: This page is for administrators only.");
                        // setAccessDenied(true);
                        // router.push(`/schools/${user.schoolId}/${user.role}`);
                    }
                } else if (response.status === 401) {
                    toast.info("Please sign in to access this page.");
                    router.push(`/sign-in?redirect=/schools/${schoolIdFromParams}/admin/bulk-import`);
                    return; // Return early to prevent setting loading to false before redirect
                } else {
                    toast.error('Failed to fetch user data. Please try again.');
                    setAccessDenied(true); // Deny access on other errors too
                }
            } catch (error) {
                toast.error('An error occurred while fetching user data.');
                console.error("Error fetching user for bulk import page:", error);
                setAccessDenied(true);
            }
            setIsLoading(false);
        };

        fetchUser();
    }, [router, schoolIdFromParams]);

    const userRole = authUser?.role;

    // Define required headers for each type
    const studentRequiredHeaders = [
        'studentUsername', 'studentPassword', 'studentEmail', 'studentFirstName', 'studentLastName',
        'studentAddress', 'studentBloodType', 'studentBirthday', 'studentSex',
        'gradeLevel', 'className',
        'parentUsername', 'parentPassword', 'parentEmail', 'parentPhone',
        'parentFirstName', 'parentLastName', 'parentAddress'
        // Optional student fields: studentPhone, studentImageURL
        // Optional parent fields: parentEmail, parentPhone
    ];

    const teacherRequiredHeaders = [
        'teacherUsername', 'teacherPassword', 'teacherEmail', 'teacherFirstName', 'teacherLastName',
        'teacherAddress', 'teacherBloodType', 'teacherBirthday', 'teacherSex',
        // subjectNames is optional
        // Optional fields: teacherPhone, teacherImageURL
    ];

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                <Image src="/logo.png" alt="Skooly Logo" width={64} height={64} className="mb-4 animate-pulse" />
                <p className="text-lg text-gray-700">Loading page...</p>
            </div>
        );
    }

    if (accessDenied) {
        return (
            <div className="p-4 md:p-6 flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                 <Image src="/logo.png" alt="Skooly Logo" width={64} height={64} className="mb-4" />
                <h1 className="text-2xl font-semibold text-red-600 mb-4">Access Denied</h1>
                <p className="text-gray-700 text-center">You do not have the necessary permissions to view this page, <br/>or the school information is incorrect.</p>
                <button 
                    onClick={() => router.push(authUser?.schoolId ? `/schools/${authUser.schoolId}/${authUser.role}` : '/')}
                    className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Go to Dashboard
                </button>
            </div>
        );
    }

    // If authUser is null but not loading and access not explicitly denied, it might be a redirect is in progress
    // or an edge case. For safety, we can prevent rendering the main content if authUser isn't fully verified yet.
    if (!authUser) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
                 <Image src="/logo.png" alt="Skooly Logo" width={64} height={64} className="mb-4 animate-pulse" />
                <p className="text-lg text-gray-700">Verifying session...</p>
            </div>
        ); 
    }

    return (
        <div className="p-4 md:p-6 flex flex-col gap-6">
            <h1 className="text-2xl font-semibold">Bulk Data Import</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Student Import Card - Admin Only */}
                {userRole === 'admin' && (
                    <BulkImportCard
                        title="Bulk Import Students"
                        templateUrl="/student_import_template.csv"
                        templateFilename="student_import_template.csv"
                        requiredHeaders={studentRequiredHeaders}
                        action={bulkCreateStudents}
                    >
                       <p>Import multiple students and optionally create their parents simultaneously.</p>
                       <p>Parent username is used for lookup. If a parent with the given username doesn't exist, they will be created using the provided parent details.</p>
                       <p className="font-semibold">Required Fields:</p>
                       <ul className="list-disc list-inside text-xs">
                            <li>Student: username, password, first/last name, address, blood type, birthday, sex, grade level, class name</li>
                            <li>Parent: username, password, first/last name, address</li>
                       </ul>
                    </BulkImportCard>
                )}

                 {/* Teacher Import Card - Admin Only */}
                 {userRole === 'admin' && (
                    <BulkImportCard
                        title="Bulk Import Teachers"
                        templateUrl="/teacher_import_template.csv"
                        templateFilename="teacher_import_template.csv"
                        requiredHeaders={teacherRequiredHeaders}
                        action={bulkCreateTeachers}
                     >
                        <p>Import multiple teachers. Subject names should be comma-separated and must match existing subjects in the system.</p>
                        <p className="font-semibold">Required Fields:</p>
                       <ul className="list-disc list-inside text-xs">
                            <li>Teacher: username, password, first/last name, address, blood type, birthday, sex</li>
                        </ul>
                     </BulkImportCard>
                )}

                 {/* Result Import Card */}
                 <BulkImportCard
                    title="Bulk Import Results"
                    templateUrl="/result_import_template.csv"
                    templateFilename="result_import_template.csv"
                    requiredHeaders={['studentUsername', 'score', 'examTitle', 'assignmentTitle']}
                    action={bulkCreateResults}
                 >
                     <p>Import multiple results for students.</p>
                     <p>Provide the student's username and the score.</p>
                     <p>Specify *either* the exact Exam Title *or* the exact Assignment Title that the score corresponds to. Leave the other title column blank.</p>
                     <p className="font-semibold">Required Column Headers:</p>
                     <ul className="list-disc list-inside text-xs">
                         <li>studentUsername</li>
                         <li>score</li>
                         <li>examTitle</li>
                         <li>assignmentTitle</li>
                     </ul>
                     <p className="font-semibold mt-2">Required per Row:</p>
                     <ul className="list-disc list-inside text-xs">
                         <li>Valid studentUsername</li>
                         <li>Numeric score</li>
                         <li>Non-empty value in EITHER examTitle OR assignmentTitle (not both)</li>
                     </ul>
                 </BulkImportCard>

                {/* Add more cards here for other entities like Results in the future */}
            </div>
        </div>
    );
};

export default BulkImportPage; 