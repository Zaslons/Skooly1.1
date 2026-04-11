"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MembershipInfo } from "@/lib/auth";

export default function SelectSchoolPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<MembershipInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchMemberships() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/sign-in");
            return;
          }
          if (!cancelled) setLoadError("Could not load your schools. Try again.");
          return;
        }
        const data = await res.json();
        if (!data.memberships || data.memberships.length === 0) {
          router.push("/create-school");
          return;
        }
        if (!cancelled) setMemberships(data.memberships);
      } catch {
        if (!cancelled) setLoadError("Something went wrong. Check your connection and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchMemberships();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSelect = async (membership: MembershipInfo) => {
    setSwitching(membership.id);
    try {
      const res = await fetch("/api/auth/select-school", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: membership.id }),
      });

      if (res.ok) {
        router.push(`/schools/${membership.schoolId}/${membership.role}`);
      }
    } catch {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <p className="text-red-600 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm hover:border-blue-400"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Select a School
        </h1>
        <p className="text-center text-gray-500 mb-8">
          You are a member of multiple schools. Choose one to continue.
        </p>
        <div className="space-y-3">
          {memberships.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              disabled={switching !== null}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50"
            >
              <div className="text-left">
                <p className="font-semibold text-gray-900">{m.schoolName}</p>
                <p className="text-sm text-gray-500 capitalize">{m.role}</p>
              </div>
              {switching === m.id ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              ) : (
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
