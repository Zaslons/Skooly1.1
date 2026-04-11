"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

type Need = {
  id: string;
  title: string;
  description: string | null;
  subjectTags: string[];
  hoursPerWeek: number | null;
  isActive: boolean;
  createdAt: string;
  applicantCount?: number;
};

export default function AdminNeedsClient({ schoolId }: { schoolId: string }) {
  const [needs, setNeeds] = useState<Need[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectTags, setSubjectTags] = useState("");
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchNeeds = useCallback(async () => {
    try {
      const res = await fetch(`/api/schools/${schoolId}/marketplace/needs`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNeeds(data.needs ?? []);
    } catch {
      toast.error("Failed to load needs");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchNeeds();
  }, [fetchNeeds]);

  const create = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/marketplace/needs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          subjectTags: subjectTags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          hoursPerWeek: hoursPerWeek ? Number(hoursPerWeek) : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNeeds((prev) => [data.need, ...prev]);
      setTitle("");
      setDescription("");
      setSubjectTags("");
      setHoursPerWeek("");
      toast.success("Need posted!");
    } catch {
      toast.error("Failed to create need");
    } finally {
      setCreating(false);
    }
  }, [schoolId, title, description, subjectTags, hoursPerWeek]);

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Posted Needs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Post open positions so teachers on the marketplace can find you.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Post a New Need</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            className={inputClass}
            placeholder="e.g. Physics Teacher Needed"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className={inputClass + " min-h-[80px] resize-y"}
            placeholder="Describe the role, requirements, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subjects (comma-separated)
            </label>
            <input
              className={inputClass}
              placeholder="e.g. Physics, Chemistry"
              value={subjectTags}
              onChange={(e) => setSubjectTags(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours/Week</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              placeholder="e.g. 10"
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {creating ? "Posting..." : "Post Need"}
          </button>
        </div>
      </div>

      {needs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No needs posted yet.
        </div>
      ) : (
        <div className="space-y-3">
          {needs.map((need) => (
            <div
              key={need.id}
              className="bg-white rounded-xl border border-gray-200 p-5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{need.title}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    need.isActive
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-gray-50 text-gray-400 border-gray-200"
                  }`}
                >
                  {need.isActive ? "Active" : "Closed"}
                </span>
              </div>
              {need.description && (
                <p className="text-sm text-gray-600">{need.description}</p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 items-center">
                {need.subjectTags.length > 0 && (
                  <span>{need.subjectTags.join(", ")}</span>
                )}
                {need.hoursPerWeek && <span>{need.hoursPerWeek} hrs/week</span>}
                <span>{new Date(need.createdAt).toLocaleDateString()}</span>
                {(need.applicantCount ?? 0) > 0 && (
                  <a
                    href={`/schools/${schoolId}/admin/marketplace/needs/${need.id}/applications`}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    {need.applicantCount} applicant{need.applicantCount !== 1 ? "s" : ""} — View
                  </a>
                )}
                {(need.applicantCount ?? 0) === 0 && (
                  <span className="text-gray-400">No applicants yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
