import Image from "next/image";
import CountChart from "./CountChart";
import prisma from "@/lib/prisma";

const CountChartContainer = async ({ 
    schoolId // <-- Add schoolId prop
}: { 
    schoolId: string // <-- Add schoolId prop type
}) => {
  // Add validation: Ensure schoolId is provided
  if (!schoolId) {
    console.error("SchoolId is required for CountChartContainer.");
    // Return a placeholder or error state
    return <div className="bg-white rounded-xl w-full h-full p-4">Error: Missing School ID</div>;
  }

  let boys = 0;
  let girls = 0;
  try {
    const data = await prisma.student.groupBy({
      by: ["sex"],
      where: { schoolId: schoolId },
      _count: true,
    });
    boys = data.find((d) => d.sex === "MALE")?._count || 0;
    girls = data.find((d) => d.sex === "FEMALE")?._count || 0;
  } catch (e) {
    console.error("CountChartContainer:", e);
    return (
      <div className="bg-white rounded-xl w-full h-full p-4 border border-amber-200 text-sm text-amber-900">
        <h1 className="text-lg font-semibold mb-2">Students</h1>
        <p>Could not load student counts. Ensure PostgreSQL is running and <code className="text-xs bg-amber-50 px-1 rounded">DATABASE_URL</code> in <code className="text-xs bg-amber-50 px-1 rounded">.env</code> is correct — see README (Docker: <code className="text-xs bg-amber-50 px-1 rounded">docker compose up -d postgres</code>).</p>
      </div>
    );
  }

  const total = boys + girls;

  return (
    <div className="bg-white rounded-xl w-full h-full p-4">
      {/* TITLE */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Students</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>
      {/* CHART */}
      <CountChart boys={boys} girls={girls} />
      {/* BOTTOM */}
      <div className="flex justify-center gap-16">
        <div className="flex flex-col gap-1">
          <div className="w-5 h-5 bg-lamaSky rounded-full" />
          <h1 className="font-bold">{boys}</h1>
          <h2 className="text-xs text-gray-300">
            Boys ({total === 0 ? 0 : Math.round((boys / total) * 100)}%)
          </h2>
        </div>
        <div className="flex flex-col gap-1">
          <div className="w-5 h-5 bg-lamaYellow rounded-full" />
          <h1 className="font-bold">{girls}</h1>
          <h2 className="text-xs text-gray-300">
            Girls ({total === 0 ? 0 : Math.round((girls / total) * 100)}%)
          </h2>
        </div>
      </div>
    </div>
  );
};

export default CountChartContainer;
