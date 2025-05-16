"use client";

import { useEffect, useState } from 'react';
import type { AuthUser } from '../lib/auth'; 
import { useRouter } from 'next/navigation';
import { getAnnouncements } from '@/lib/actions'; // Import the server action
import type { Announcement as PrismaAnnouncement, Class } from '@prisma/client'; // Import Prisma types

// Define a more specific type for Announcements in the component
interface AnnouncementWithClass extends PrismaAnnouncement {
  class?: { name?: string } | null; // class can be null from Prisma include
}

const Announcements = ({ 
    schoolId
}: { 
    schoolId: string
}) => {
  // Removed authUser state and related fetching from here, 
  // as auth should be handled by the page or a higher-order component if needed for UI.
  // The server action getAnnouncements will handle its own auth implicitly if needed or throw.
  const [announcements, setAnnouncements] = useState<AnnouncementWithClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter(); // Keep router if needed for other purposes, e.g. navigation

  useEffect(() => {
    const fetchData = async () => {
      if (!schoolId) {
        setError("School ID is missing.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      try {
        // Call the server action directly
        const data = await getAnnouncements(schoolId);
        // Assuming your Prisma schema for Announcement has `createdAt` and not `date`
        // And the server action returns data compatible with AnnouncementWithClass
        // The `slice(0,3)` was in your original code, retaining it.
        setAnnouncements(data.slice(0, 3) as AnnouncementWithClass[]); 
      } catch (err: any) {
        console.error("Error fetching announcements:", err.message);
        setError(err.message || "Failed to fetch announcements.");
      }
      setLoading(false);
    };

    fetchData();
  }, [schoolId]);

  if (loading) {
    return <div className="bg-white p-4 rounded-md">Loading announcements...</div>;
  }

  if (error) {
    return <div className="bg-white p-4 rounded-md text-red-500">Error: {error}</div>;
  }
  
  // Since authUser is removed from this component's state, 
  // this check is no longer applicable here. Page-level auth should protect the component's rendering.
  // if (!authUser) {
  //   return <div className="bg-white p-4 rounded-md">Authenticating...</div>;
  // }

  return (
    <div className="bg-white p-4 rounded-md">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Announcements</h1>
        {/* TODO: Make "View All" link functional, e.g., to /schools/[schoolId]/announcements page */}
        <span className="text-xs text-gray-400 cursor-pointer hover:underline">View All</span>
      </div>
      <div className="flex flex-col gap-4 mt-4">
        {announcements.length > 0 ? (
          <>
            {announcements.map((announcement, index) => (
              <div 
                key={announcement.id} 
                className={`${ 
                  index === 0 ? 'bg-lamaSkyLight' : 
                  index === 1 ? 'bg-lamaPurpleLight' : 
                  'bg-lamaYellowLight'
                } rounded-md p-4`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">{announcement.title}</h2>
                  <span className="text-xs text-gray-400 bg-white rounded-md px-1 py-1">
                    {/* Assuming your Prisma model uses `createdAt` for the announcement date */}
                    {new Intl.DateTimeFormat("en-GB").format(new Date(announcement.createdAt))}
                  </span>
                </div>
                {/* Assuming your Prisma model uses `content` for the announcement body */}
                <p className="text-sm text-gray-400 mt-1 truncate">{announcement.content}</p>
                {announcement.class?.name && (
                  <p className="text-xs text-gray-500 mt-1">For Class: {announcement.class.name}</p>
                )}
              </div>
            ))}
          </>
        ) : (
          <p>No announcements found.</p>
        )}
      </div>
    </div>
  );
};

export default Announcements;
