"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";

export default function AdminMarketplaceClient({ schoolId }: { schoolId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/marketplace/settings`)
      .then((r) => r.json())
      .then((d) => setEnabled(d.isEnabled ?? false))
      .catch(() => toast.error("Failed to load marketplace settings"))
      .finally(() => setLoading(false));
  }, [schoolId]);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch(`/api/schools/${schoolId}/marketplace/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      setEnabled(next);
      toast.success(next ? "Marketplace enabled" : "Marketplace disabled");
    } catch {
      toast.error("Failed to update marketplace settings");
    } finally {
      setSaving(false);
    }
  }, [enabled, schoolId]);

  if (loading) {
    return <div className="p-6 text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Marketplace</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enable the marketplace to search for and invite teachers from the Skooly network.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Marketplace Access</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {enabled
                ? "Your school can search teacher profiles and send invitations."
                : "Enable to start browsing and inviting teachers."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
              enabled ? "bg-blue-600" : "bg-gray-200"
            }`}
            role="switch"
            aria-checked={enabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {enabled && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={`/schools/${schoolId}/admin/marketplace/search`}
              className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <span className="text-blue-700 text-xl">&#128269;</span>
              <div>
                <p className="font-medium text-sm text-gray-900">Search Teachers</p>
                <p className="text-xs text-gray-500">Browse available teacher profiles</p>
              </div>
            </a>
            <a
              href={`/schools/${schoolId}/admin/marketplace/invitations`}
              className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              <span className="text-indigo-700 text-xl">&#9993;</span>
              <div>
                <p className="font-medium text-sm text-gray-900">Invitations</p>
                <p className="text-xs text-gray-500">Track sent invitations</p>
              </div>
            </a>
            <a
              href={`/schools/${schoolId}/admin/marketplace/engagements`}
              className="flex items-center gap-3 p-3 rounded-lg bg-green-50 hover:bg-green-100 transition-colors"
            >
              <span className="text-green-700 text-xl">&#129309;</span>
              <div>
                <p className="font-medium text-sm text-gray-900">Engagements</p>
                <p className="text-xs text-gray-500">Manage active engagements</p>
              </div>
            </a>
            <a
              href={`/schools/${schoolId}/admin/marketplace/needs`}
              className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              <span className="text-amber-700 text-xl">&#128220;</span>
              <div>
                <p className="font-medium text-sm text-gray-900">Posted Needs</p>
                <p className="text-xs text-gray-500">Post open positions for teachers</p>
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
