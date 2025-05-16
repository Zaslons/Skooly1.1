import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import React from "react";

// This layout captures the schoolId and provides it to child components if needed,
// or allows child pages/layouts to access it directly via params.
// It renders the children passed to it, effectively injecting itself
// between the main dashboard layout and the actual page content.
export default function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { schoolId: string };
}) {

  // We could potentially fetch school-specific data here if needed globally
  // for this school segment, or pass params down.

  // For now, just render children. Components rendered further down
  // (like Menu and Navbar via the main layout, or pages here)
  // will need to access params themselves or have it passed explicitly.
  return <>{children}</>;
} 