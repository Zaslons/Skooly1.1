"use server";

import { getVerifiedAuthUser } from "@/lib/actions";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import FormContainer from "@/components/FormContainer";

interface UserProfilePageProps {
  params: {
    schoolId: string;
    authId: string;
  };
}

const UserProfilePage = async ({ params }: UserProfilePageProps) => {
  const loggedInUser = await getVerifiedAuthUser();

  if (!loggedInUser) {
    // This should ideally be caught by middleware, but as a safeguard:
    return <div className="p-4">User not authenticated. Please sign in.</div>;
  }

  // 1. Authorization: Check if the logged-in user is trying to access a profile within their own school
  if (loggedInUser.schoolId !== params.schoolId) {
    return (
      <div className="p-4 bg-white rounded-md m-4">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p>You are not authorized to view profiles for this school.</p>
      </div>
    );
  }

  // 2. Fetch the Auth record of the user whose profile is being viewed
  const targetUserAuth = await prisma.auth.findUnique({
    where: {
      id: params.authId,
      schoolId: params.schoolId, // Ensure they belong to the school in the URL
    },
  });

  if (!targetUserAuth) {
    notFound(); // Or return a custom "Profile not found" component
  }

  // 3. Authorization: 
  //    - Admins can view any profile in their school.
  //    - Non-admins (Parents in this context, as Teachers/Students have their own detail pages) can only view their own profile.
  if (loggedInUser.role !== 'admin' && loggedInUser.id !== targetUserAuth.id) {
    return (
      <div className="p-4 bg-white rounded-md m-4">
        <h1 className="text-xl font-semibold text-red-600">Access Denied</h1>
        <p>You do not have permission to view this profile.</p>
      </div>
    );
  }
  
  // 4. Fetch specific profile details based on role
  let userProfileData: any = null; // Keep it any for now, will refine with specific types
  let profileType = "";

  if (targetUserAuth.role === "admin") {
    userProfileData = await prisma.admin.findUnique({
      where: { authId: targetUserAuth.id },
    });
    profileType = "Admin";
  } else if (targetUserAuth.role === "parent") {
    userProfileData = await prisma.parent.findUnique({
      where: { authId: targetUserAuth.id },
      include: { 
        students: { // Include children for parent's profile
          select: { id: true, name: true, surname: true, class: { select: { name: true }} }
        } 
      }
    });
    profileType = "Parent";
  } else {
    // This page is not intended for teachers or students, they have dedicated pages
    return (
      <div className="p-4 bg-white rounded-md m-4">
        <h1 className="text-xl font-semibold text-orange-600">Information</h1>
        <p>Teacher and Student profiles are viewed on their specific detail pages.</p>
      </div>
    );
  }

  if (!userProfileData) {
    return (
      <div className="p-4 bg-white rounded-md m-4">
        <h1 className="text-xl font-semibold text-red-600">Profile Not Found</h1>
        <p>The specific {profileType.toLowerCase()} profile details could not be loaded.</p>
      </div>
    );
  }

  // Basic display - can be greatly enhanced
  return (
    <div className="p-6 bg-white shadow-md rounded-lg m-4">
      <div className="flex items-center space-x-4 mb-6">
        <Image 
            src={userProfileData.img || "/noAvatar.png"} 
            alt={`${userProfileData.name} ${userProfileData.surname}`} 
            width={96} 
            height={96} 
            className="rounded-full object-cover w-24 h-24"
        />
        <div>
          <h1 className="text-3xl font-bold">{userProfileData.name} {userProfileData.surname}</h1>
          <p className="text-md text-gray-600">Username: {targetUserAuth.username}</p>
          <p className="text-md text-gray-500">Role: {profileType}</p>
          <p className="text-md text-gray-500">Email: {targetUserAuth.email || "N/A"}</p>
          {userProfileData.phone && <p className="text-md text-gray-500">Phone: {userProfileData.phone}</p>}
          {/* Edit button for own profile */}
          {loggedInUser.id === targetUserAuth.id && (targetUserAuth.role === 'admin' || targetUserAuth.role === 'parent') && (
            <div className="ml-auto self-start">
              <FormContainer 
                table={targetUserAuth.role as 'admin' | 'parent'} 
                type="update" 
                id={userProfileData.id} 
                data={userProfileData} 
                authUser={loggedInUser} 
              />
            </div>
          )}
        </div>
      </div>

      {targetUserAuth.role === 'parent' && userProfileData.students && userProfileData.students.length > 0 && (
        <div className="mt-6 pt-6 border-t">
          <h2 className="text-2xl font-semibold mb-4">Children</h2>
          <ul className="space-y-3">
            {userProfileData.students.map((student: any) => (
              <li key={student.id}>
                <Link 
                  href={`/schools/${params.schoolId}/list/students/${student.id}`}
                  className="block p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-lamaSky"
                >
                  <p className="font-medium text-lg text-lama događaji">{student.name} {student.surname}</p>
                  <p className="text-sm text-gray-600">Class: {student.class?.name || "N/A"}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* TODO: Add more profile details as needed, forms for updates if user is viewing their own profile, etc. */}
    </div>
  );
};

export default UserProfilePage; 