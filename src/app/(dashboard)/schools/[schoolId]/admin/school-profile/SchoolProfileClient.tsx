'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'react-toastify';
import { updateSchoolProfileAction } from '@/lib/actions/catalogInstallActions';
import { TEACHING_SYSTEM_OPTIONS } from '@/lib/catalog/teachingSystems';

export default function SchoolProfileClient({
  schoolId,
  schoolName,
  initialCountry,
  initialTeachingSystem,
}: {
  schoolId: string;
  schoolName: string;
  initialCountry: string | null;
  initialTeachingSystem: string | null;
}) {
  const [country, setCountry] = useState(initialCountry ?? '');
  const [teachingSystem, setTeachingSystem] = useState(initialTeachingSystem ?? '');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = country.trim().toUpperCase();
    if (c && c.length !== 2) {
      toast.error('Country must be a 2-letter ISO code (e.g. MA) or empty.');
      return;
    }
    startTransition(async () => {
      const res = await updateSchoolProfileAction({
        schoolId,
        country: c || null,
        teachingSystem: teachingSystem.trim() || null,
      });
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">School profile</h1>
        <p className="mt-1 text-sm text-gray-600">{schoolName}</p>
        <p className="mt-2 text-xs text-gray-500">
          Country and teaching system filter which <strong>curriculum catalog</strong> templates are suggested when installing
          offerings. This is not legal advice — always review installed data.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700">
            Country (ISO 3166-1 alpha-2)
          </label>
          <input
            id="country"
            maxLength={2}
            placeholder="e.g. MA"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            className="mt-1 w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
            disabled={isPending}
          />
        </div>
        <div>
          <label htmlFor="teachingSystem" className="block text-sm font-medium text-gray-700">
            Teaching system
          </label>
          <select
            id="teachingSystem"
            value={teachingSystem}
            onChange={(e) => setTeachingSystem(e.target.value)}
            className="mt-1 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={isPending}
          >
            <option value="">Not set</option>
            {TEACHING_SYSTEM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </form>

      <p className="text-sm">
        <Link href={`/schools/${schoolId}/admin/setup/catalog-install`} className="text-indigo-700 underline">
          Install curriculum from catalog
        </Link>
      </p>
    </div>
  );
}
