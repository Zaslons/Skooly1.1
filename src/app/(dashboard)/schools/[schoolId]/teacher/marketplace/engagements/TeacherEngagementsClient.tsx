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
  school: { id: string; name: string };
  reviews: { reviewerRole: string; rating: number }[];
};

const statusBadge: Record<string, string> = {
  ACTIVE: "bg-green-50 text-green-700 border-green-200",
  COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  TERMINATED: "bg-red-50 text-red-700 border-red-200",
};

export default function TeacherEngagementsClient() {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/marketplace/engagements")
      .then((r) => r.json())
      .then((d) => setEngagements(d.engagements ?? []))
      .catch(() => toast.error("Failed to load engagements"))
      .finally(() => setLoading(false));
  }, []);

  const review = useCallback(async (id: string) => {
    const rating = prompt("Rate the school (1-5):");
    if (!rating) return;
    const n = Number(rating);
    if (isNaN(n) || n < 1 || n > 5) {
      toast.error("Rating must be 1-5");
      return;
    }
    try {
      const res = await fetch(`/api/marketplace/engagements/${id}/review`, {
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
            ? { ...e, reviews: [...e.reviews, { reviewerRole: "TEACHER", rating: n }] }
            : e
        )
      );
    } catch (e: any) {
      toast.error(e.message || "Review failed");
    }
  }, []);

  if (loading) return <div className="text-gray-500">Loading engagements...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Engagements</h1>
        <p className="text-sm text-gray-500 mt-1">Schools you work with through the marketplace.</p>
      </div>

      {engagements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No engagements yet.
        </div>
      ) : (
        <div className="space-y-3">
          {engagements.map((eng) => {
            const hasTeacherReview = eng.reviews.some((r) => r.reviewerRole === "TEACHER");
            return (
              <div
                key={eng.id}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{eng.school.name}</p>
                  <span
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${statusBadge[eng.status] ?? ""}`}
                  >
                    {eng.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Started {new Date(eng.startDate).toLocaleDateString()}
                  {eng.endDate && ` — Ended ${new Date(eng.endDate).toLocaleDateString()}`}
                </p>
                <div className="flex gap-4 text-xs text-gray-500">
                  {eng.agreedHoursPerWeek && <span>{eng.agreedHoursPerWeek} hrs/week</span>}
                  {eng.agreedHourlyRate && <span>{eng.agreedHourlyRate} MAD/hr</span>}
                </div>
                {eng.status !== "ACTIVE" && !hasTeacherReview && (
                  <button
                    type="button"
                    onClick={() => review(eng.id)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Leave a review
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
