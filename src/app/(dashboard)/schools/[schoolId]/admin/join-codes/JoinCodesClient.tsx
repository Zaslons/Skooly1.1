'use client';

import { useState, useTransition } from 'react';
import { createJoinCodeAction, deactivateJoinCodeAction } from '@/lib/actions/joinCodeActions';
import { useRouter } from 'next/navigation';

interface JoinCodeItem {
  id: string;
  code: string;
  type: string;
  className: string | null;
  classId: number | null;
  studentId: string | null;
  email: string | null;
  maxUses: number | null;
  currentUses: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  schoolId: string;
  joinCodes: JoinCodeItem[];
  classes: { id: number; name: string }[];
  students: { id: string; name: string; surname: string }[];
}

export default function JoinCodesClient({ schoolId, joinCodes, classes, students }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [formType, setFormType] = useState<'CLASS_STUDENT' | 'TEACHER_INVITE' | 'PARENT_LINK'>('CLASS_STUDENT');
  const [classId, setClassId] = useState<number | undefined>();
  const [studentId, setStudentId] = useState<string | undefined>();
  const [email, setEmail] = useState('');
  const [maxUses, setMaxUses] = useState<string>('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreate = () => {
    setError('');
    startTransition(async () => {
      const result = await createJoinCodeAction({
        schoolId,
        type: formType,
        classId: formType === 'CLASS_STUDENT' ? classId : undefined,
        studentId: formType === 'PARENT_LINK' ? studentId : undefined,
        email: formType === 'TEACHER_INVITE' && email ? email : undefined,
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresInDays: expiresInDays ? parseInt(expiresInDays) : undefined,
      });

      if (result.success && result.joinCode) {
        setCreatedCode(result.joinCode.code);
        setShowCreate(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleDeactivate = (id: string) => {
    startTransition(async () => {
      await deactivateJoinCodeAction(id, schoolId);
      router.refresh();
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join` : '/join';

  const typeLabels: Record<string, string> = {
    CLASS_STUDENT: 'Class (Parent+Student)',
    TEACHER_INVITE: 'Teacher Invite',
    PARENT_LINK: 'Parent Link',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Join Codes</h1>
          <p className="text-gray-500 mt-1">Generate codes to invite parents, students, and teachers to your school.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedCode(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
        >
          + New Code
        </button>
      </div>

      {createdCode && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <p className="text-green-800 font-medium mb-2">Join code created successfully!</p>
          <div className="flex items-center gap-3">
            <code className="bg-white border border-green-300 px-4 py-2 rounded-lg text-lg font-mono tracking-widest">
              {createdCode}
            </code>
            <button
              onClick={() => copyToClipboard(createdCode)}
              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => copyToClipboard(`${joinUrl}?code=${createdCode}`)}
              className="text-sm bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
            >
              Copy Link
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Create New Join Code</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code Type</label>
              <select
                value={formType}
                onChange={e => setFormType(e.target.value as any)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="CLASS_STUDENT">Class Enrollment (Parent + Student)</option>
                <option value="TEACHER_INVITE">Teacher Invite</option>
                <option value="PARENT_LINK">Parent Link (to existing student)</option>
              </select>
            </div>

            {formType === 'CLASS_STUDENT' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Class</label>
                <select
                  value={classId ?? ''}
                  onChange={e => setClassId(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {formType === 'PARENT_LINK' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
                <select
                  value={studentId ?? ''}
                  onChange={e => setStudentId(e.target.value || undefined)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select a student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.surname} {s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {formType === 'TEACHER_INVITE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restrict to Email (optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="teacher@example.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses (blank = unlimited)</label>
              <input
                type="number"
                value={maxUses}
                onChange={e => setMaxUses(e.target.value)}
                min="1"
                placeholder="Unlimited"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires in (days)</label>
              <input
                type="number"
                value={expiresInDays}
                onChange={e => setExpiresInDays(e.target.value)}
                min="1"
                placeholder="30"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isPending || (formType === 'CLASS_STUDENT' && !classId) || (formType === 'PARENT_LINK' && !studentId)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isPending ? 'Creating...' : 'Generate Code'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Code</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Details</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Uses</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {joinCodes.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">No join codes yet.</td>
              </tr>
            )}
            {joinCodes.map((jc) => {
              const isExpired = jc.expiresAt && new Date(jc.expiresAt) < new Date();
              const isExhausted = jc.maxUses && jc.currentUses >= jc.maxUses;
              const status = !jc.isActive ? 'Inactive' : isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active';
              const statusColor = status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600';

              return (
                <tr key={jc.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3">
                    <code className="bg-gray-50 px-2 py-1 rounded text-sm font-mono">{jc.code}</code>
                  </td>
                  <td className="px-4 py-3 text-sm">{typeLabels[jc.type] ?? jc.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {jc.className && `Class: ${jc.className}`}
                    {jc.email && `Email: ${jc.email}`}
                    {jc.studentId && `Student ID: ${jc.studentId.substring(0, 8)}...`}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {jc.currentUses}{jc.maxUses ? ` / ${jc.maxUses}` : ' / ∞'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColor}`}>{status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(jc.code)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Copy
                      </button>
                      {jc.isActive && !isExpired && !isExhausted && (
                        <button
                          onClick={() => handleDeactivate(jc.id)}
                          disabled={isPending}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
