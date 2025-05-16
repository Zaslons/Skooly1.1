import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import Image from "next/image";
import Link from "next/link";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-screen flex">
      {/* LEFT - Sidebar Area */}
      <div className="w-[14%] md:w-[8%] lg:w-[16%] xl:w-[14%] p-4 border-r border-gray-200">
        {/* Logo/App Name Removed From Here */}
        <Menu />
      </div>
      {/* RIGHT - Main Content Area */}
      <div className="w-[86%] md:w-[92%] lg:w-[84%] xl:w-[86%] bg-[#F7F8FA] flex flex-col">
        <Navbar />
        <div className="overflow-y-auto flex-grow p-4"> {/* Added padding & scroll */} 
          {children}
        </div>
      </div>
    </div>
  );
}
