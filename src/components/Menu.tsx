"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthUser } from "../lib/auth";
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
  ChevronDoubleLeftIcon,
  Bars3Icon,
  ArrowsRightLeftIcon,
  KeyIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface MembershipInfo {
  id: string;
  schoolId: string;
  schoolName: string;
  role: string;
  isActive: boolean;
  profileId?: string;
}

const menuItems = [
  {
    title: "MAIN",
    items: [
      {
        icon: HomeIcon,
        label: "Home",
        href: "/",
        visible: ["admin", "teacher", "student", "parent"],
      },
    ],
  },
  {
    title: "PEOPLE",
    items: [
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
    ],
  },
  {
    title: "SCHOOL",
    items: [
      {
        icon: ListBulletIcon,
        label: "Grades",
        href: "/list/grades",
        visible: ["admin"],
      },
      {
        icon: BuildingLibraryIcon,
        label: "Classes",
        href: "/list/classes",
        visible: ["admin", "teacher"],
      },
      {
        icon: BookOpenIcon,
        label: "Subjects",
        href: "/list/subjects",
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
    ],
  },
  {
    title: "SCHEDULING",
    items: [
      {
        icon: ClipboardDocumentListIcon,
        label: "Lessons",
        href: "/list/lessons",
        visible: ["admin", "teacher"],
      },
      {
        icon: CalendarIcon,
        label: "My Schedule",
        href: "/teacher/my-schedule",
        visible: ["teacher"],
      },
      {
        icon: CalendarIcon,
        label: "My Schedule",
        href: "/student/my-schedule",
        visible: ["student"],
      },
      {
        icon: CalendarDaysIcon,
        label: "Manage Schedule",
        href: "/admin/schedule",
        visible: ["admin"],
      },
      {
        icon: ClipboardDocumentCheckIcon,
        label: "Scheduling Setup",
        href: "/admin/setup",
        visible: ["admin"],
      },
      {
        icon: ArrowsRightLeftIcon,
        label: "Timetable assistant",
        href: "/admin/timetable-assistant",
        visible: ["admin"],
      },
      {
        icon: ArrowsRightLeftIcon,
        label: "Whole-school timetable",
        href: "/admin/timetable-assistant/school",
        visible: ["admin"],
      },
      {
        icon: ClockIcon,
        label: "Bell schedule",
        href: "/admin/setup/bell-schedule",
        visible: ["admin"],
      },
      {
        icon: CalendarDaysIcon,
        label: "Calendar exceptions",
        href: "/admin/calendar-exceptions",
        visible: ["admin"],
      },
      {
        icon: UserCircleIcon,
        label: "Teacher Availability",
        href: "/teacher/availability",
        visible: ["teacher"],
      },
      {
        icon: BuildingStorefrontIcon,
        label: "Marketplace Profile",
        href: "/teacher/marketplace",
        visible: ["teacher"],
      },
      {
        icon: PencilSquareIcon,
        label: "My Change Requests",
        href: "/teacher/my-requests",
        visible: ["teacher"],
      },
      {
        icon: ClipboardDocumentCheckIcon,
        label: "Pending Requests",
        href: "/admin/schedule-requests",
        visible: ["admin"],
      },
    ],
  },
  {
    title: "ACADEMICS",
    items: [
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
        visible: ["admin", "teacher", "student", "parent"],
      },
    ],
  },
  {
    title: "FAMILY",
    items: [
      {
        icon: UsersIcon,
        label: "My Children",
        href: "/parent/my-children",
        visible: ["parent"],
      },
    ],
  },
  {
    title: "ADMIN TOOLS",
    items: [
      {
        icon: ChartBarIcon,
        label: "Grading Scales",
        href: "/admin/grading-scale",
        visible: ["admin"],
      },
      {
        icon: ArrowPathIcon,
        label: "Promotions",
        href: "/admin/promotions",
        visible: ["admin"],
      },
      {
        icon: KeyIcon,
        label: "Join Codes",
        href: "/admin/join-codes",
        visible: ["admin"],
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
        icon: BuildingStorefrontIcon,
        label: "Teacher Marketplace",
        href: "/admin/marketplace",
        visible: ["admin"],
      },
    ],
  },
  {
    title: "COMMUNICATION",
    items: [
      {
        icon: CalendarIcon,
        label: "Events",
        href: "/list/events",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: MegaphoneIcon,
        label: "Announcements",
        href: "/list/announcements",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: EnvelopeIcon,
        label: "Messages",
        href: "/list/messages",
        visible: ["admin", "teacher", "student", "parent"],
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
        alwaysShowLabel: true,
      },
    ],
  },
];

const Menu = () => {
  const { schoolId: schoolIdFromParams } = useParams();
  const router = useRouter();
  const [authUser, setAuthUser] = useState<(AuthUser & { memberships?: MembershipInfo[] }) | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

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
          if (response.status === 401 && window.location.pathname !== '/sign-in' && window.location.pathname !== '/create-school') {
            router.push("/sign-in?message=Session expired. Please sign in again.");
          }
        }
      } catch {
        setAuthUser(null);
      }
      setLoadingAuth(false);
    };
    fetchCurrentUser();
  }, [router]);
  
  const role = authUser?.role as string;

  const constructPath = (baseHref: string, currentSchoolIdParam?: string | string[]) => {
    const currentSchoolId = Array.isArray(currentSchoolIdParam) ? currentSchoolIdParam[0] : currentSchoolIdParam;

    if (baseHref.startsWith("/system/")) {
      return baseHref;
    }

    let attendanceBasePath = "/list/attendance";
    if (role === "teacher") attendanceBasePath = "/teacher/attendance";
    else if (role === "student") attendanceBasePath = "/student/attendance";
    else if (role === "parent") attendanceBasePath = "/parent/attendance";

    if (currentSchoolId && (baseHref.startsWith("/list/") || baseHref.startsWith("/admin/") || baseHref === "/academic-years")) {
      return `/schools/${currentSchoolId}${baseHref}`;
    } else if (currentSchoolId && (baseHref.startsWith("/teacher/") || baseHref.startsWith("/student/"))) {
      return `/schools/${currentSchoolId}${baseHref}`;
    } else if (currentSchoolId && baseHref === "/attendance") {
      return `/schools/${currentSchoolId}${attendanceBasePath}`;
    } else if (currentSchoolId && baseHref === "/") {
      switch (role) {
        case 'admin':
          return `/schools/${currentSchoolId}/admin`;
        case 'teacher':
          if (authUser?.profileId) {
            return `/schools/${currentSchoolId}/list/teachers/${authUser.profileId}`;
          }
          return `/schools/${currentSchoolId}/teacher`;
        case 'student':
          if (authUser?.profileId) {
            return `/schools/${currentSchoolId}/list/students/${authUser.profileId}`;
          }
          return `/schools/${currentSchoolId}/student`;
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
        return `/schools/${currentSchoolId}/profile/${authUser.id}`;
      }
      return currentSchoolId ? `/schools/${currentSchoolId}/profile` : "/profile"; 
    } else if (baseHref === "/settings") {
      return currentSchoolId ? `/schools/${currentSchoolId}/settings` : "/settings";
    } else if (baseHref === "/logout") {
      return "/api/auth/sign-out";
    }
    if (role === 'system_admin' && baseHref === '/') {
      return '/system/dashboard';
    }
    if (role === 'system_admin' && baseHref === '/profile') {
      return '/system/profile';
    }
    if (role === 'system_admin' && baseHref === '/settings') {
      return '/system/settings';
    }
    return baseHref; 
  };

  const isItemVisible = (itemRoles: string[]) => {
    if (loadingAuth) return false;
    if (!authUser) return false;
    return itemRoles.some(r => authUser.role === r);
  };

  const hasMultipleSchools = (authUser?.memberships?.length ?? 0) > 1;
  const schoolIdStr = Array.isArray(schoolIdFromParams) ? schoolIdFromParams[0] : schoolIdFromParams;
  const currentSchoolName = authUser?.memberships?.find((m) => m.schoolId === schoolIdStr)?.schoolName;
  
  if (loadingAuth && !authUser && typeof window !== 'undefined' && window.location.pathname !== '/sign-in' && window.location.pathname !== '/create-school') {
    return <div className="w-64 h-screen bg-gray-100 p-3 flex flex-col" />;
  }

  if (typeof window !== 'undefined' && (window.location.pathname === '/sign-in' || window.location.pathname === '/create-school' || window.location.pathname === '/select-school' || window.location.pathname === '/join')) {
    return null;
  }
  
  if (!loadingAuth && !authUser) {
    return null;
  }

  return (
    <div 
      className={`h-screen bg-gray-100 text-gray-800 flex flex-col justify-between transition-all duration-300 ease-in-out ${isOpen ? 'w-64' : 'w-20'}`}
    >
      <div className="flex-grow overflow-y-auto overflow-x-hidden">
        {hasMultipleSchools && isOpen && (
          <div className="px-3 pt-3 pb-1 space-y-1">
            {currentSchoolName && (
              <p className="px-1 text-xs text-gray-500 truncate" title={currentSchoolName}>
                Current: <span className="font-medium text-gray-700">{currentSchoolName}</span>
              </p>
            )}
            <button
              onClick={() => router.push('/select-school')}
              className="w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <ArrowsRightLeftIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <span className="truncate text-gray-700 font-medium">Switch School</span>
            </button>
          </div>
        )}

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
                      <li key={item.label + item.href}>
                        <Link
                          href={constructPath(item.href, schoolIdFromParams)}
                          className={`flex items-center space-x-3 rounded-md px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900 group ${!isOpen ? 'justify-center' : ''}`}
                        >
                          <item.icon className="h-5 w-5 flex-shrink-0 text-gray-500 group-hover:text-gray-700" />
                          {(isOpen || (item as any).alwaysShowLabel) && <span className="truncate">{item.label}</span>}
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
      
      <div className={`p-2 border-t border-gray-200 ${isOpen ? 'flex justify-end' : 'flex justify-center'}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={isOpen ? "Collapse menu" : "Expand menu"}
        >
          {isOpen ? (
            <ChevronDoubleLeftIcon className="h-6 w-6" />
          ) : (
            <Bars3Icon className="h-6 w-6" />
          )}
        </button>
      </div>
    </div>
  );
};

export default Menu;
