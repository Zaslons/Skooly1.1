"use client";

import { useEffect, useState } from "react";
import { toast } from "react-toastify";

type Application = {
  id: string;
  status: string;
  message: string | null;
  createdAt: string;
  teacher: {
    id: string;
    name: string;
    surname: string;
    img: string | null;
    marketplaceProfile: {
      headline: string | null;
      subjectTags: string[];
      hourlyRate: number | null;
      currency: string;
      city: string | null;
      yearsOfExp: number | null;
    } | null;
  };
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  REVIEWED: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

export default function NeedApplicationsClient({
  schoolId,
  needId,
}: {
  schoolId: string;
  needId: string;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/marketplace/needs/${needId}/applications`)
      .then((r) => r.json())
      .then((d) => setApplications(d.applications ?? []))
      .catch(() => toast.error("Failed to load applications"))
      .finally(() => setLoading(false));
  }, [schoolId, needId]);

  if (loading) return <div className="text-gray-500">Loading applicants...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <a
          href={`/schools/${schoolId}/admin/marketplace/needs`}
          className="text-sm text-blue-600 hover:underline"
        >
          &larr; Back to Needs
        </a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Applicants</h1>
        <p className="text-sm text-gray-500 mt-1">
          {applications.length} teacher{applications.length !== 1 ? "s" : ""} expressed interest.
        </p>
      </div>

      {applications.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No applications yet.
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => {
            const p = app.teacher.marketplaceProfile;
            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {app.teacher.name[0]}
                      {app.teacher.surname[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {app.teacher.name} {app.teacher.surname}
                      </p>
                      {p?.headline && (
                        <p className="text-xs text-gray-500">{p.headline}</p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-medium shrink-0 ${
                      statusBadge[app.status] ?? ""
                    }`}
                  >
                    {app.status}
                  </span>
                </div>

                {p && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {p.subjectTags.length > 0 && (
                      <span>{p.subjectTags.join(", ")}</span>
                    )}
                    {p.hourlyRate != null && (
                      <span className="text-green-600 font-medium">
                        {p.hourlyRate} {p.currency}/hr
                      </span>
                    )}
                    {p.yearsOfExp != null && <span>{p.yearsOfExp} yrs exp</span>}
                    {p.city && <span>{p.city}</span>}
                  </div>
                )}

                {app.message && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {app.message}
                  </p>
                )}

                <p className="text-xs text-gray-400">
                  Applied {new Date(app.createdAt).toLocaleDateString()}
                </p>

                <div className="flex gap-2">
                  <a
                    href={`/schools/${schoolId}/admin/marketplace/search`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Invite this teacher
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
