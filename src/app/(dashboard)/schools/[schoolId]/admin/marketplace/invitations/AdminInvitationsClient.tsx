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
  teacher: { id: string; name: string; surname: string; img: string | null };
};

const statusBadge: Record<string, string> = {
  PENDING: "bg-yellow-50 text-yellow-700 border-yellow-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  DECLINED: "bg-red-50 text-red-700 border-red-200",
  WITHDRAWN: "bg-gray-50 text-gray-500 border-gray-200",
  EXPIRED: "bg-gray-50 text-gray-400 border-gray-200",
};

export default function AdminInvitationsClient({ schoolId }: { schoolId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/marketplace/invitations`)
      .then((r) => r.json())
      .then((d) => setInvitations(d.invitations ?? []))
      .catch(() => toast.error("Failed to load invitations"))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const withdraw = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/schools/${schoolId}/marketplace/invitations/${id}`, {
          method: "PATCH",
        });
        if (!res.ok) throw new Error();
        setInvitations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "WITHDRAWN" } : i))
        );
        toast.success("Invitation withdrawn");
      } catch {
        toast.error("Failed to withdraw");
      }
    },
    [schoolId]
  );

  if (loading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sent Invitations</h1>
        <p className="text-sm text-gray-500 mt-1">Track invitations sent to teachers.</p>
      </div>

      {invitations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No invitations sent yet.
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                  {inv.teacher.name[0]}{inv.teacher.surname[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {inv.teacher.name} {inv.teacher.surname}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${statusBadge[inv.status] ?? ""}`}
                >
                  {inv.status}
                </span>
                {inv.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => withdraw(inv.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
