"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

type Invitation = {
  id: string;
  status: string;
  message: string | null;
  proposedHoursPerWeek: number | null;
  proposedHourlyRate: number | null;
  createdAt: string;
  school: { id: string; name: string };
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  DECLINED: "bg-red-50 text-red-700 border-red-200",
  WITHDRAWN: "bg-gray-50 text-gray-500 border-gray-200",
  EXPIRED: "bg-gray-50 text-gray-400 border-gray-200",
};

export default function TeacherInvitationsClient() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/marketplace/invitations")
      .then((r) => r.json())
      .then((d) => setInvitations(d.invitations ?? []))
      .catch(() => toast.error("Failed to load invitations"))
      .finally(() => setLoading(false));
  }, []);

  const respond = useCallback(async (id: string, action: "accept" | "decline") => {
    setRespondingId(id);
    try {
      const res = await fetch(`/api/marketplace/invitations/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Action failed");
      }
      setInvitations((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, status: action === "accept" ? "ACCEPTED" : "DECLINED" } : i
        )
      );
      toast.success(action === "accept" ? "Invitation accepted!" : "Invitation declined");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setRespondingId(null);
    }
  }, []);

  if (loading) return <div className="text-gray-500">Loading invitations...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invitations</h1>
        <p className="text-sm text-gray-500 mt-1">Schools that want to work with you.</p>
      </div>

      {invitations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No invitations yet. Make sure your marketplace profile is published!
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="bg-white rounded-xl border border-gray-200 p-5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{inv.school.name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${statusBadge[inv.status] ?? ""}`}
                >
                  {inv.status}
                </span>
              </div>

              {inv.message && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{inv.message}</p>
              )}

              <div className="flex gap-4 text-xs text-gray-500">
                {inv.proposedHoursPerWeek != null && (
                  <span>{inv.proposedHoursPerWeek} hrs/week</span>
                )}
                {inv.proposedHourlyRate != null && (
                  <span>{inv.proposedHourlyRate} MAD/hr</span>
                )}
              </div>

              {inv.status === "PENDING" && (
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => respond(inv.id, "accept")}
                    disabled={respondingId === inv.id}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(inv.id, "decline")}
                    disabled={respondingId === inv.id}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
