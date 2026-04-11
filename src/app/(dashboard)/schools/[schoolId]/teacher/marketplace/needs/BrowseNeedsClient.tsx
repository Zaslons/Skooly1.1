"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

type MyApp = { id: string; status: string } | null;

type Need = {
  id: string;
  title: string;
  description: string | null;
  subjectTags: string[];
  hoursPerWeek: number | null;
  createdAt: string;
  applicantCount: number;
  myApplication: MyApp;
  school: { id: string; name: string; country: string | null };
};

const statusLabel: Record<string, string> = {
  PENDING: "Applied",
  REVIEWED: "Under Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

const statusClass: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  REVIEWED: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

export default function BrowseNeedsClient() {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [messageMap, setMessageMap] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/needs")
      .then((r) => r.json())
      .then((d) => setNeeds(d.needs ?? []))
      .catch(() => toast.error("Failed to load needs"))
      .finally(() => setLoading(false));
  }, []);

  const apply = useCallback(
    async (needId: string) => {
      setApplyingId(needId);
      try {
        const res = await fetch(`/api/marketplace/needs/${needId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: messageMap[needId] || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to apply");
        }
        const data = await res.json();
        setNeeds((prev) =>
          prev.map((n) =>
            n.id === needId
              ? {
                  ...n,
                  myApplication: { id: data.application.id, status: "PENDING" },
                  applicantCount: n.applicantCount + 1,
                }
              : n
          )
        );
        setExpandedId(null);
        toast.success("Interest expressed! The school will review your application.");
      } catch (e: any) {
        toast.error(e.message || "Failed to apply");
      } finally {
        setApplyingId(null);
      }
    },
    [messageMap]
  );

  if (loading) return <div className="text-gray-500">Loading open positions...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Open Positions</h1>
        <p className="text-sm text-gray-500 mt-1">
          Schools looking for teachers. Express interest to let them know you're available.
        </p>
      </div>

      {needs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No open positions at the moment.
        </div>
      ) : (
        <div className="space-y-3">
          {needs.map((need) => {
            const applied = need.myApplication != null;
            const expanded = expandedId === need.id;

            return (
              <div
                key={need.id}
                className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{need.title}</h3>
                    <p className="text-xs text-indigo-600 font-medium">
                      {need.school.name}
                      {need.school.country ? ` — ${need.school.country}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {need.hoursPerWeek && (
                      <span className="text-xs text-gray-500">{need.hoursPerWeek} hrs/week</span>
                    )}
                    {need.applicantCount > 0 && (
                      <span className="text-xs text-gray-400">
                        {need.applicantCount} applicant{need.applicantCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {need.description && (
                  <p className="text-sm text-gray-600">{need.description}</p>
                )}

                {need.subjectTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {need.subjectTags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {applied ? (
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-medium ${
                      statusClass[need.myApplication!.status] ?? ""
                    }`}
                  >
                    {statusLabel[need.myApplication!.status] ?? need.myApplication!.status}
                  </span>
                ) : (
                  <>
                    {expanded ? (
                      <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                        <textarea
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 min-h-[70px] resize-y"
                          placeholder="Add a message (optional) — tell the school why you're a great fit..."
                          value={messageMap[need.id] ?? ""}
                          onChange={(e) =>
                            setMessageMap((prev) => ({ ...prev, [need.id]: e.target.value }))
                          }
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => apply(need.id)}
                            disabled={applyingId === need.id}
                            className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                          >
                            {applyingId === need.id ? "Sending..." : "Submit Application"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedId(null)}
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedId(need.id)}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        Express Interest
                      </button>
                    )}
                  </>
                )}

                <p className="text-xs text-gray-400">
                  Posted {new Date(need.createdAt).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
