"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Profile", suffix: "" },
  { label: "Invitations", suffix: "/invitations" },
  { label: "Engagements", suffix: "/engagements" },
  { label: "Open Positions", suffix: "/needs" },
] as const;

export default function TeacherMarketplaceNav({ schoolId }: { schoolId: string }) {
  const pathname = usePathname();
  const base = `/schools/${schoolId}/teacher/marketplace`;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {tabs.map((tab) => {
        const href = base + tab.suffix;
        const active = tab.suffix === ""
          ? pathname === base || pathname === base + "/"
          : pathname.startsWith(href);
        return (
          <a
            key={tab.suffix}
            href={href}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              active
                ? "border-blue-500 bg-blue-50 text-blue-800"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            )}
          >
            {tab.label}
          </a>
        );
      })}
    </div>
  );
}
