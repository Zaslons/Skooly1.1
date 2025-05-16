"use client";

// import { UserButton, useUser } from "@clerk/nextjs"; // Removed Clerk imports
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation"; // Added useRouter
import { useEffect, useState } from "react";
import { getSchoolNameById, getActiveAcademicYearName } from "@/lib/actions"; // Added getActiveAcademicYearName
// import { verifyToken, type AuthUser } from "@/lib/auth"; // No longer verify token client-side
import type { AuthUser } from "@/lib/auth"; // Still need AuthUser type

const Navbar = () => {
  const { schoolId: schoolIdParam } = useParams();
  // const { user } = useUser(); // Removed Clerk useUser
  const router = useRouter(); // Initialize useRouter
  const [schoolName, setSchoolName] = useState<string | null>("Loading...");
  const [activeYearName, setActiveYearName] = useState<string | null>(""); // State for active academic year name
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const schoolId = Array.isArray(schoolIdParam) ? schoolIdParam[0] : schoolIdParam;

  useEffect(() => {
    // Fetch school name and active academic year name
    if (schoolId) {
      getSchoolNameById(schoolId)
        .then((name) => {
          setSchoolName(name ?? "School Not Found");
        })
        .catch((err) => {
          console.error("Failed to fetch school name:", err);
          setSchoolName("Error");
        });

      getActiveAcademicYearName(schoolId)
        .then((yearName) => {
          setActiveYearName(yearName); // Set active year name, can be null or a message like "No active year"
        })
        .catch((err) => {
          console.error("Failed to fetch active academic year name:", err);
          setActiveYearName("Error fetching year");
        });
    } else {
      setSchoolName(null);
      setActiveYearName(null);
    }

    const fetchCurrentUser = async () => {
      setLoadingAuth(true);
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const user = await response.json();
          setAuthUser(user);
        } else {
          setAuthUser(null);
          // Optional: redirect if strictly necessary here, but middleware should protect pages
          // if (response.status === 401 && window.location.pathname !== '/sign-in') {
          //   router.push('/sign-in');
          // }
        }
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        setAuthUser(null);
      }
      setLoadingAuth(false);
    };

    fetchCurrentUser();
  }, [schoolId, router]); // Added router to dependency array

  const handleSignOut = () => {
    // Navigate to the GET API route for sign-out
    // The API route will handle cookie clearing and redirection
    router.push("/api/auth/sign-out");
  };

  const attendanceHref = schoolId ? `/schools/${schoolId}/attendance` : '#';

  // Show a loading state or minimal navbar while authUser is being determined
  // to prevent flash of "Sign In" button for authenticated users.
  // if (loadingAuth) {
  //   return <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0 z-10">Loading...</div>; 
  // }

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
      {/* LEFT: School Name */}
      <div className="flex-1 text-left">
        {schoolName && (
            <span className="font-semibold text-lg text-gray-700">
              {schoolName}
              {activeYearName && activeYearName !== "No active year set" && activeYearName !== "Error fetching year" && (
                <span className="text-sm text-gray-500 ml-2">({activeYearName})</span>
              )}
            </span>
        )}
      </div>

      {/* MIDDLE: Logo/App Name */}
      <div className="flex-1 text-center">
        <Link href={authUser && authUser.schoolId ? `/schools/${authUser.schoolId}/${authUser.role}` : "/"} className="flex items-center justify-center gap-2">
            <Image src="/logo.png" alt="logo" width={32} height={32} />
            <span className="font-bold text-xl">Skooly</span>
        </Link>
      </div>

      {/* RIGHT: Icons and User */}
      <div className="flex flex-1 items-center gap-4 justify-end">
        {/* Optional: Search Bar - might need rework if still desired */}
        {/* <div className="hidden md:flex items-center gap-2 text-xs rounded-full ring-[1.5px] ring-gray-300 px-2">
          <Image src="/search.png" alt="" width={14} height={14} />
          <input
            type="text"
            placeholder="Search..."
            className="w-[150px] p-1 bg-transparent outline-none"
          />
        </div> */}

        <Link href={attendanceHref} className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer">
          <Image src="/attendance.png" alt="Attendance" width={20} height={20} />
        </Link>
        {/* Add links for messages/announcements if needed, using schoolId */}
        <div className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer">
          <Image src="/message.png" alt="Messages" width={20} height={20} />
        </div>
        <div className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center cursor-pointer relative">
          <Image src="/announcement.png" alt="Announcements" width={20} height={20} />
          {/* Notification badge logic might need update */}
          <div className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center bg-purple-500 text-white rounded-full text-[10px]">
            1
          </div>
        </div>
        {authUser ? (
          <>
        <div className="flex flex-col items-end">
          <span className="text-sm leading-4 font-medium">
                {authUser.email} {/* Display user email */}
          </span>
          <span className="text-xs text-gray-500">
                {authUser.role} {/* Display user role */}
          </span>
        </div>
            <button 
              onClick={handleSignOut} 
              className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/sign-in" className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors">
            Sign In
          </Link>
        )}
      </div>
    </div>
  );
};

export default Navbar;
