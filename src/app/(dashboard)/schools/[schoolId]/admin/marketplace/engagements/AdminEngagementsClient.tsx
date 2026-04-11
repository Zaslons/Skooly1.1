"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

type Engagement = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  agreedHoursPerWeek: number | null;
  agreedHourlyRate: number | null;
  teacher: { id: string; name: string; surname: string };
  reviews: { reviewerRole: string; rating: number }[];
};

const statusBadge: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  TERMINATED: "bg-red-50 text-red-700 border-red-200",
};

export default function AdminEngagementsClient({ schoolId }: { schoolId: string }) {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/marketplace/engagements`)
      .then((r) => r.json())
      .then((d) => setEngagements(d.engagements ?? []))
      .catch(() => toast.error("Failed to load engagements"))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const endEngagement = useCallback(
    async (id: string, status: "COMPLETED" | "TERMINATED") => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/marketplace/engagements/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error();
        setEngagements((prev) =>
          prev.map((e) => (e.id === id ? { ...e, status, endDate: new Date().toISOString() } : e))
        );
        toast.success(`Engagement ${status.toLowerCase()}`);
      } catch {
        toast.error("Failed to update engagement");
      }
    },
    [schoolId]
  );

  const review = useCallback(
    async (id: string) => {
      const rating = prompt("Rate the teacher (1-5):");
      if (!rating) return;
      const n = Number(rating);
      if (isNaN(n) || n < 1 || n > 5) {
        toast.error("Rating must be 1-5");
        return;
      }
      try {
        const res = await fetch(`/api/schools/${schoolId}/marketplace/engagements/${id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: n }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Review failed");
        }
        toast.success("Review submitted!");
        setEngagements((prev) =>
          prev.map((e) =>
            e.id === id
              ? { ...e, reviews: [...e.reviews, { reviewerRole: "SCHOOL", rating: n }] }
              : e
          )
        );
      } catch (e: any) {
        toast.error(e.message || "Review failed");
      }
    },
    [schoolId]
  );

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Engagements</h1>
        <p className="text-sm text-gray-500 mt-1">Manage teacher engagements from the marketplace.</p>
      </div>

      {engagements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No engagements yet.
        </div>
      ) : (
        <div className="space-y-3">
          {engagements.map((eng) => {
            const hasSchoolReview = eng.reviews.some((r) => r.reviewerRole === "SCHOOL");
            return (
              <div
                key={eng.id}
                className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {eng.teacher.name} {eng.teacher.surname}
                  </p>
                  <p className="text-xs text-gray-500">
                    Started {new Date(eng.startDate).toLocaleDateString()}
                    {eng.endDate && ` — Ended ${new Date(eng.endDate).toLocaleDateString()}`}
                  </p>
                  {eng.agreedHoursPerWeek && (
                    <p className="text-xs text-gray-500">{eng.agreedHoursPerWeek} hrs/week</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${statusBadge[eng.status] ?? ""}`}
                  >
                    {eng.status}
                  </span>
                  {eng.status === "ACTIVE" && (
                    <>
                      <button
                        type="button"
                        onClick={() => endEngagement(eng.id, "COMPLETED")}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        onClick={() => endEngagement(eng.id, "TERMINATED")}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Terminate
                      </button>
                    </>
                  )}
                  {eng.status !== "ACTIVE" && !hasSchoolReview && (
                    <button
                      type="button"
                      onClick={() => review(eng.id)}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
