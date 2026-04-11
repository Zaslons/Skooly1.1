"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import TeacherMarketplaceNav from "@/components/marketplace/TeacherMarketplaceNav";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

type Profile = {
  teacherId: string;
  id: string | null;
  headline: string | null;
  bio: string | null;
  yearsOfExp: number | null;
  hourlyRate: number | null;
  currency: string;
  isPublished: boolean;
  subjectTags: string[];
  availableDays: string[];
  maxHoursPerWeek: number | null;
  city: string | null;
  country: string;
  willingToRelocate: boolean;
  offersOnline: boolean;
};

export default function MarketplaceProfileClient({ schoolId }: { schoolId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    fetch("/api/marketplace/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => toast.error("Failed to load marketplace profile"))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/marketplace/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: profile.headline,
          bio: profile.bio,
          yearsOfExp: profile.yearsOfExp,
          hourlyRate: profile.hourlyRate,
          currency: profile.currency,
          isPublished: profile.isPublished,
          subjectTags: profile.subjectTags,
          availableDays: profile.availableDays,
          maxHoursPerWeek: profile.maxHoursPerWeek,
          city: profile.city,
          country: profile.country,
          willingToRelocate: profile.willingToRelocate,
          offersOnline: profile.offersOnline,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      const updated = await res.json();
      setProfile(updated);
      toast.success("Profile saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const set = <K extends keyof Profile>(key: K, val: Profile[K]) =>
    setProfile((p) => (p ? { ...p, [key]: val } : p));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && profile && !profile.subjectTags.includes(tag)) {
      set("subjectTags", [...profile.subjectTags, tag]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    if (profile) set("subjectTags", profile.subjectTags.filter((t) => t !== tag));
  };

  const toggleDay = (day: string) => {
    if (!profile) return;
    set(
      "availableDays",
      profile.availableDays.includes(day)
        ? profile.availableDays.filter((d) => d !== day)
        : [...profile.availableDays, day]
    );
  };

  if (loading) {
    return <div className="p-6 text-gray-500">Loading profile...</div>;
  }
  if (!profile) {
    return <div className="p-6 text-red-500">Could not load profile.</div>;
  }

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

  return (
    <div className="max-w-2xl space-y-6">
      <TeacherMarketplaceNav schoolId={schoolId} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace Profile</h1>
          <p className="text-sm text-gray-500 mt-1">
            Make yourself visible to schools looking for teachers.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm font-medium text-gray-700">Published</span>
          <input
            type="checkbox"
            checked={profile.isPublished}
            onChange={(e) => set("isPublished", e.target.checked)}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
          <input
            className={inputClass}
            placeholder="e.g. Experienced Math & Physics Teacher"
            value={profile.headline ?? ""}
            onChange={(e) => set("headline", e.target.value || null)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
          <textarea
            className={inputClass + " min-h-[100px] resize-y"}
            placeholder="Tell schools about your experience, teaching style, and what makes you a great fit..."
            value={profile.bio ?? ""}
            onChange={(e) => set("bio", e.target.value || null)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={profile.yearsOfExp ?? ""}
              onChange={(e) => set("yearsOfExp", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Hours/Week</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={profile.maxHoursPerWeek ?? ""}
              onChange={(e) => set("maxHoursPerWeek", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (placeholder)</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className={inputClass}
              value={profile.hourlyRate ?? ""}
              onChange={(e) => set("hourlyRate", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <input
              className={inputClass}
              value={profile.currency}
              onChange={(e) => set("currency", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Subjects</h2>
        <div className="flex gap-2">
          <input
            className={inputClass + " flex-1"}
            placeholder="Add a subject tag (e.g. Mathematics)"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2 text-sm font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Add
          </button>
        </div>
        {profile.subjectTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {profile.subjectTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-600"
                  aria-label={`Remove ${tag}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Availability</h2>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const active = profile.availableDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500/30"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {day.charAt(0) + day.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">Location</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              className={inputClass}
              placeholder="e.g. Casablanca"
              value={profile.city ?? ""}
              onChange={(e) => set("city", e.target.value || null)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
            <input
              className={inputClass}
              value={profile.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.willingToRelocate}
              onChange={(e) => set("willingToRelocate", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Willing to relocate</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.offersOnline}
              onChange={(e) => set("offersOnline", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Offers online teaching</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </div>
  );
}
