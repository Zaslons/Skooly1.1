"use client";

// import { useUser } from "@clerk/nextjs"; // Removed Clerk import
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation"; // Added useRouter
import { useEffect, useState } from "react"; // Added useEffect, useState
// import { verifyToken, type AuthUser } from "../lib/auth"; // No longer verify token client-side
import type { AuthUser } from "../lib/auth"; // Still need AuthUser type
import { 
  ArrowDownOnSquareIcon, 
  CreditCardIcon, 
  CalendarDaysIcon,
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  UsersIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  ListBulletIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  DocumentTextIcon,
  TableCellsIcon,
  ClipboardDocumentCheckIcon,
  CalendarIcon,
  EnvelopeIcon,
  MegaphoneIcon,
  CogIcon,
  BuildingStorefrontIcon,
  UserCircleIcon,
  WrenchScrewdriverIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  ChevronDoubleLeftIcon, // Added for toggle
  Bars3Icon, // Added for toggle when collapsed
} from '@heroicons/react/24/outline';

const menuItems = [
  {
    title: "MENU",
    items: [
      {
        icon: HomeIcon,
        label: "Home",
        href: "/",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: UserGroupIcon,
        label: "Teachers",
        href: "/list/teachers",
        visible: ["admin"],
      },
      {
        icon: AcademicCapIcon,
        label: "Students",
        href: "/list/students",
        visible: ["admin", "teacher"],
      },
      {
        icon: UsersIcon,
        label: "Parents",
        href: "/list/parents",
        visible: ["admin", "teacher"],
      },
      {
        icon: BookOpenIcon,
        label: "Subjects",
        href: "/list/subjects",
        visible: ["admin"],
      },
      {
        icon: BuildingLibraryIcon,
        label: "Classes",
        href: "/list/classes",
        visible: ["admin", "teacher"],
      },
      {
        icon: ListBulletIcon,
        label: "Grades",
        href: "/list/grades",
        visible: ["admin"],
      },
      {
        icon: BuildingStorefrontIcon,
        label: "Rooms",
        href: "/list/rooms",
        visible: ["admin"],
      },
      {
        icon: CalendarDaysIcon,
        label: "Academic Years",
        href: "/academic-years",
        visible: ["admin"],
      },
      {
        icon: ClipboardDocumentListIcon,
        label: "Lessons",
        href: "/list/lessons",
        visible: ["admin", "teacher"],
      },
      {
        icon: UserCircleIcon, // Changed icon for better visual
        label: "Teacher Availability", // Changed label for consistency
        href: "/teacher/availability",
        visible: ["teacher"],
      },
      {
        icon: CalendarIcon, // Changed icon
        label: "My Schedule",
        href: "/teacher/my-schedule",
        visible: ["teacher"],
      },
      {
        icon: PencilSquareIcon, // Changed icon
        label: "My Change Requests", // Changed label for consistency
        href: "/teacher/my-requests",
        visible: ["teacher"],
      },
      {
        icon: ClipboardDocumentCheckIcon, // Changed icon
        label: "Pending Requests", // New Admin Link
        href: "/admin/schedule-requests",
        visible: ["admin"],
      },
      {
        icon: PencilSquareIcon,
        label: "Exams",
        href: "/list/exams",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: DocumentTextIcon,
        label: "Assignments",
        href: "/list/assignments",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: TableCellsIcon,
        label: "Results",
        href: "/list/results",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: ClipboardDocumentCheckIcon,
        label: "Attendance",
        href: "/attendance",
        visible: ["admin", "teacher"], // Only admin and teacher take attendance usually
      },
      {
        icon: CalendarIcon,
        label: "Events",
        href: "/list/events",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: EnvelopeIcon,
        label: "Messages",
        href: "/list/messages",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: MegaphoneIcon,
        label: "Announcements",
        href: "/list/announcements",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: ArrowDownOnSquareIcon,
        label: "Bulk Import",
        href: "/admin/bulk-import",
        visible: ["admin"],
      },
      {
        icon: CreditCardIcon,
        label: "Subscription",
        href: "/admin/subscription",
        visible: ["admin"],
      },
      {
        icon: CalendarDaysIcon,
        label: "Manage Schedule",
        href: "/admin/schedule",
        visible: ["admin"],
      },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      {
        icon: CogIcon,
        label: "Subscription Plans",
        href: "/system/plans",
        visible: ["system_admin"],
      },
      {
        icon: BuildingStorefrontIcon,
        label: "School Subscriptions",
        href: "/system/school-subscriptions",
        visible: ["system_admin"],
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      {
        icon: UserCircleIcon,
        label: "Profile",
        href: "/profile",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: WrenchScrewdriverIcon,
        label: "Settings",
        href: "/settings",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: ArrowRightOnRectangleIcon,
        label: "Logout",
        href: "/logout",
        visible: ["admin", "teacher", "student", "parent"],
        alwaysShowLabel: true, // Special prop for logout
      },
    ],
  },
];

const Menu = () => {
  const { schoolId: schoolIdFromParams } = useParams();
  // const { user } = useUser(); // Removed Clerk useUser
  const router = useRouter(); // Initialize useRouter
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true); // Renamed for clarity
  const [isOpen, setIsOpen] = useState(true); // State for menu collapse

  useEffect(() => {
    const fetchCurrentUser = async () => {
      setLoadingAuth(true);
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const user = await response.json();
          setAuthUser(user);
        } else {
          setAuthUser(null);
          // If not authenticated, middleware should ideally handle redirection.
          // However, if a page is somehow accessed without middleware (e.g. static export), 
          // or for an extra layer of client-side safety:
          if (response.status === 401 && window.location.pathname !== '/sign-in' && window.location.pathname !== '/create-school') {
             router.push("/sign-in?message=Session expired. Please sign in again.");
          }
        }
      } catch (error) {
        console.error("Failed to fetch current user for menu:", error);
        setAuthUser(null);
      }
      setLoadingAuth(false);
    };
    fetchCurrentUser();
  }, [router]); // router is a dependency
  
  const role = authUser?.role as string;

  const constructPath = (baseHref: string, currentSchoolIdParam?: string | string[]) => {
    const currentSchoolId = Array.isArray(currentSchoolIdParam) ? currentSchoolIdParam[0] : currentSchoolIdParam;

    // NEW: Handle system admin routes first - they are not school-specific
    if (baseHref.startsWith("/system/")) {
      return baseHref;
    }

    // Determine the correct base path for attendance based on role
    // These paths should now match the actual directory structure
    let attendanceBasePath = "/list/attendance"; // Admin
    if (role === "teacher") attendanceBasePath = "/teacher/attendance"; // Teacher
    else if (role === "student") attendanceBasePath = "/student/attendance"; // Student
    else if (role === "parent") attendanceBasePath = "/parent/attendance"; // Parent
    

    // Construct path based on type
    if (currentSchoolId && (baseHref.startsWith("/list/") || baseHref.startsWith("/admin/") || baseHref === "/academic-years")) {
      return `/schools/${currentSchoolId}${baseHref}`;
    } else if (currentSchoolId && baseHref.startsWith("/teacher/")) {
      return `/schools/${currentSchoolId}${baseHref}`;
    } else if (currentSchoolId && baseHref === "/attendance") {
      // Use the role-specific base path for the attendance link
      return `/schools/${currentSchoolId}${attendanceBasePath}`;
    } else if (currentSchoolId && baseHref === "/") {
      // Home link goes to the role-specific dashboard or profile page
      switch (role) {
        case 'admin':
          return `/schools/${currentSchoolId}/admin`;
        case 'teacher':
          if (authUser?.profileId) {
            return `/schools/${currentSchoolId}/list/teachers/${authUser.profileId}`;
          }
          return `/schools/${currentSchoolId}/teacher`; // Fallback teacher dashboard
        case 'student':
          if (authUser?.profileId) {
            return `/schools/${currentSchoolId}/list/students/${authUser.profileId}`;
          }
          return `/schools/${currentSchoolId}/student`; // Fallback student dashboard
        case 'parent':
          return `/schools/${currentSchoolId}/parent`;
        default:
          return `/schools/${currentSchoolId}`;
      }
    } else if (baseHref === "/profile") {
      if (role === 'teacher' && authUser?.profileId) {
        return `/schools/${currentSchoolId}/list/teachers/${authUser.profileId}`;
      } else if (role === 'student' && authUser?.profileId) {
        return `/schools/${currentSchoolId}/list/students/${authUser.profileId}`;
      } else if ((role === 'admin' || role === 'parent') && authUser?.id && currentSchoolId) {
        // Generic profile page for admin/parent using their Auth ID
        return `/schools/${currentSchoolId}/profile/${authUser.id}`;
      }
      // Fallback if role/id is missing or not admin/parent/teacher/student with profileId
      return currentSchoolId ? `/schools/${currentSchoolId}/profile` : "/profile"; 
    } else if (baseHref === "/settings") {
        // Generic settings page, school-contextual
        return currentSchoolId ? `/schools/${currentSchoolId}/settings` : "/settings";
    } else if (baseHref === "/logout") {
        return "/api/auth/sign-out"; // Direct to API route for logout
    }
    // Other top-level links or unhandled cases
    // For system_admin role, if currentSchoolId is not available (which it shouldn't be for sys admin specific views)
    // and baseHref is like '/', it should probably go to a system admin dashboard.
    if (role === 'system_admin' && baseHref === '/') {
        return '/system/dashboard'; // Or whatever the main system admin page is
    }
    if (role === 'system_admin' && baseHref === '/profile') {
        // System admin might have a profile page not tied to a school
        return '/system/profile'; // Example, ensure this page exists
    }
    if (role === 'system_admin' && baseHref === '/settings') {
        return '/system/settings'; // Example
    }
    return baseHref; 
  };

  const isItemVisible = (itemRoles: string[]) => {
    if (loadingAuth) return false; // Don't show items if auth state is unknown
    if (!authUser) return false; // No user, no items (except potentially public ones if any)
    return itemRoles.some(role => authUser.role === role);
  };
  
  if (loadingAuth && !authUser && window.location.pathname !== '/sign-in' && window.location.pathname !== '/create-school') {
    // Optional: Render a minimal loading state for the menu area or nothing
    // to prevent layout shifts if the menu suddenly appears.
    return <div className="w-64 h-screen bg-gray-100 p-3 flex flex-col">{/* Skeleton or loading */}</div>;
  }

  // Don't render the menu on sign-in or create-school pages
  if (window.location.pathname === '/sign-in' || window.location.pathname === '/create-school') {
    return null;
  }
  
  // If not loading and no authenticated user, also don't render the menu
  // This case should ideally be handled by page-level redirection by middleware
  if (!loadingAuth && !authUser) {
      return null;
  }

  return (
    <div 
      className={`h-screen bg-gray-100 text-gray-800 flex flex-col justify-between transition-all duration-300 ease-in-out ${isOpen ? 'w-64' : 'w-20'}`}
    >
      <div className="flex-grow overflow-y-auto overflow-x-hidden">
        {/* Logo and App Name - Commented out as per previous request */}
        {/* <div className={`p-4 ${isOpen ? 'flex items-center space-x-3' : 'flex justify-center py-3'}`}>
          <Image
            src="/skooly_logo.png"
            alt="Skooly Logo"
            width={isOpen ? 40 : 32}
            height={isOpen ? 40 : 32}
            className="rounded-full"
          />
          {isOpen && <span className="text-xl font-bold text-gray-900">Skooly</span>}
        </div> */}
        
        <nav className="mt-3 px-2">
          {menuItems.map((section) =>
            section.items.some(item => isItemVisible(item.visible)) ? (
              <div key={section.title} className="mb-4">
                <h2
                  className={`text-xs font-semibold text-gray-500 uppercase tracking-wider ${isOpen ? 'px-3 mb-2' : 'text-center mb-2'}`}
                >
                  {isOpen ? section.title : section.title.substring(0,1)}
                </h2>
                <ul>
                  {section.items.map((item) =>
                    isItemVisible(item.visible) ? (
                      <li key={item.label}>
                        <Link
                          href={constructPath(item.href, schoolIdFromParams)}
                          className={`flex items-center space-x-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 group ${!isOpen ? 'justify-center' : ''}`}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0 text-gray-500 group-hover:text-gray-700" />
                          {(isOpen || item.alwaysShowLabel) && <span className="truncate">{item.label}</span>}
                        </Link>
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
            ) : null
          )}
        </nav>
      </div>
      
      {/* Toggle Button */}
      <div className={`p-2 border-t border-gray-200 ${isOpen ? 'flex justify-end' : 'flex justify-center'}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={isOpen ? "Collapse menu" : "Expand menu"}
        >
          {isOpen ? (
            <ChevronDoubleLeftIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" /> // Using Bars3Icon when collapsed
          )}
        </button>
      </div>
    </div>
  );
};

export default Menu;
