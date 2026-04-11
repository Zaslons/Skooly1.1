"use client";

import { useCallback, useState } from "react";
import { toast } from "react-toastify";

type SearchResult = {
  profileId: string;
  teacherId: string;
  name: string;
  img: string | null;
  headline: string | null;
  subjectTags: string[];
  availableDays: string[];
  maxHoursPerWeek: number | null;
  hourlyRate: number | null;
  currency: string;
  city: string | null;
  country: string | null;
  offersOnline: boolean;
  willingToRelocate: boolean;
  yearsOfExp: number | null;
  avgRating: number | null;
  reviewCount: number;
};

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export default function MarketplaceSearchClient({ schoolId }: { schoolId: string }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [subjects, setSubjects] = useState("");
  const [city, setCity] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const search = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (subjects.trim()) params.set("subjects", subjects.trim());
      if (city.trim()) params.set("city", city.trim());
      if (onlineOnly) params.set("offersOnline", "true");
      if (selectedDays.length > 0) params.set("availableDays", selectedDays.join(","));

      const res = await fetch(`/api/schools/${schoolId}/marketplace/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results);
      setTotal(data.total);
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  }, [schoolId, subjects, city, onlineOnly, selectedDays]);

  const invite = useCallback(
    async (teacherId: string) => {
      setInvitingId(teacherId);
      try {
        const res = await fetch(`/api/schools/${schoolId}/marketplace/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherId }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Invite failed");
        }
        toast.success("Invitation sent!");
      } catch (e: any) {
        toast.error(e.message || "Invite failed");
      } finally {
        setInvitingId(null);
      }
    },
    [schoolId]
  );

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search Teachers</h1>
        <p className="text-sm text-gray-500 mt-1">
          Find teachers by subject, location, and availability.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subjects</label>
            <input
              className={inputClass}
              placeholder="e.g. Mathematics, Physics"
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              className={inputClass}
              placeholder="e.g. Casablanca"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Available Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const active = selectedDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {day.charAt(0) + day.slice(1, 3).toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlineOnly}
              onChange={(e) => setOnlineOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Online only</span>
          </label>
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {searched && !loading && (
        <p className="text-sm text-gray-500">{total} teacher{total !== 1 ? "s" : ""} found</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((r) => (
          <div
            key={r.profileId}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col"
          >
            <div className="p-5 flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-lg font-bold shrink-0">
                  {r.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                  {r.headline && (
                    <p className="text-xs text-gray-500 truncate">{r.headline}</p>
                  )}
                  {r.avgRating != null && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      {"★".repeat(Math.round(r.avgRating))}{"☆".repeat(5 - Math.round(r.avgRating))}{" "}
                      {r.avgRating.toFixed(1)} ({r.reviewCount})
                    </p>
                  )}
                </div>
              </div>

              {r.subjectTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Subjects</p>
                  <div className="flex flex-wrap gap-1">
                    {r.subjectTags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {r.hourlyRate != null && (
                  <div className="bg-green-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-green-700">{r.hourlyRate}</p>
                    <p className="text-xs text-green-600">{r.currency}/hr</p>
                  </div>
                )}
                {r.maxHoursPerWeek != null && (
                  <div className="bg-indigo-50 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-indigo-700">{r.maxHoursPerWeek}</p>
                    <p className="text-xs text-indigo-600">hrs/week max</p>
                  </div>
                )}
              </div>

              {r.availableDays.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Availability</p>
                  <div className="flex flex-wrap gap-1">
                    {r.availableDays.map((d) => (
                      <span
                        key={d}
                        className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                      >
                        {d.charAt(0) + d.slice(1, 3).toLowerCase()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                {r.city && <span>{r.city}{r.country ? `, ${r.country}` : ""}</span>}
                {r.yearsOfExp != null && <span>{r.yearsOfExp} yrs exp</span>}
                {r.offersOnline && <span className="text-green-600 font-medium">Online</span>}
                {r.willingToRelocate && <span className="text-indigo-600 font-medium">Will relocate</span>}
              </div>
            </div>

            <div className="px-5 pb-4">
              <button
                type="button"
                onClick={() => invite(r.teacherId)}
                disabled={invitingId === r.teacherId}
                className="w-full py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {invitingId === r.teacherId ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
