'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'code' | 'form';

interface JoinCodeInfo {
  type: 'CLASS_STUDENT' | 'TEACHER_INVITE' | 'PARENT_LINK';
  school: { id: string; name: string };
  class?: { id: number; name: string } | null;
  studentId?: string | null;
}

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [codeInfo, setCodeInfo] = useState<JoinCodeInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (urlCode) {
      setCode(urlCode.toUpperCase());
    }
  }, []);

  const [parentForm, setParentForm] = useState({
    name: '', surname: '', email: '', phone: '', address: '', username: '', password: '',
  });
  const [studentForm, setStudentForm] = useState({
    name: '', surname: '', birthday: '', sex: 'MALE' as 'MALE' | 'FEMALE', bloodType: 'O+', address: '',
  });
  const [teacherForm, setTeacherForm] = useState({
    name: '', surname: '', email: '', phone: '', address: '', username: '', password: '',
    bloodType: 'O+', sex: 'MALE' as 'MALE' | 'FEMALE' | 'OTHER', birthday: '',
  });

  const validateCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/join/validate?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setError(data.message || data.error || 'Invalid join code.');
        return;
      }
      setCodeInfo(data.joinCode);
      setStep('form');
    } catch {
      setError('Failed to validate code.');
    } finally {
      setLoading(false);
    }
  };

  const submitJoin = async () => {
    setError('');
    setLoading(true);
    try {
      let body: any = { code };

      if (codeInfo?.type === 'CLASS_STUDENT') {
        body.parent = parentForm;
        body.student = studentForm;
      } else if (codeInfo?.type === 'TEACHER_INVITE') {
        body.teacher = teacherForm;
      } else if (codeInfo?.type === 'PARENT_LINK') {
        body.parent = parentForm;
      }

      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to join.');
        return;
      }

      if (data.redirect) {
        router.push(data.redirect);
      }
    } catch {
      setError('An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Join a School</h1>
        <p className="text-gray-500 mb-6">Enter the join code provided by your school.</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {step === 'code' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Join Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-lg tracking-widest text-center font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={12}
            />
            <button
              onClick={validateCode}
              disabled={!code || loading}
              className="mt-4 w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Checking...' : 'Continue'}
            </button>
            <p className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <a href="/sign-in" className="text-blue-600 hover:underline">Sign in</a>
            </p>
          </div>
        )}

        {step === 'form' && codeInfo && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">School:</span> {codeInfo.school.name}
                {codeInfo.class && <> &middot; <span className="font-semibold">Class:</span> {codeInfo.class.name}</>}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {codeInfo.type === 'CLASS_STUDENT' && 'Registering as a parent with a new student'}
                {codeInfo.type === 'TEACHER_INVITE' && 'Joining as a teacher'}
                {codeInfo.type === 'PARENT_LINK' && 'Linking as a parent to an existing student'}
              </p>
            </div>

            {(codeInfo.type === 'CLASS_STUDENT' || codeInfo.type === 'PARENT_LINK') && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Parent Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="First Name" value={parentForm.name} onChange={v => setParentForm(p => ({ ...p, name: v }))} />
                  <InputField label="Last Name" value={parentForm.surname} onChange={v => setParentForm(p => ({ ...p, surname: v }))} />
                  <InputField label="Email" type="email" value={parentForm.email} onChange={v => setParentForm(p => ({ ...p, email: v }))} className="col-span-2" />
                  <InputField label="Username" value={parentForm.username} onChange={v => setParentForm(p => ({ ...p, username: v }))} />
                  <InputField label="Password" type="password" value={parentForm.password} onChange={v => setParentForm(p => ({ ...p, password: v }))} />
                  <InputField label="Phone" value={parentForm.phone} onChange={v => setParentForm(p => ({ ...p, phone: v }))} />
                  <InputField label="Address" value={parentForm.address} onChange={v => setParentForm(p => ({ ...p, address: v }))} />
                </div>
              </div>
            )}

            {codeInfo.type === 'CLASS_STUDENT' && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Student Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="First Name" value={studentForm.name} onChange={v => setStudentForm(s => ({ ...s, name: v }))} />
                  <InputField label="Last Name" value={studentForm.surname} onChange={v => setStudentForm(s => ({ ...s, surname: v }))} />
                  <InputField label="Birthday" type="date" value={studentForm.birthday} onChange={v => setStudentForm(s => ({ ...s, birthday: v }))} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sex</label>
                    <select
                      value={studentForm.sex}
                      onChange={e => setStudentForm(s => ({ ...s, sex: e.target.value as 'MALE' | 'FEMALE' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Blood Type</label>
                    <select
                      value={studentForm.bloodType}
                      onChange={e => setStudentForm(s => ({ ...s, bloodType: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bt => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                    </select>
                  </div>
                  <InputField label="Address" value={studentForm.address} onChange={v => setStudentForm(s => ({ ...s, address: v }))} className="col-span-2" />
                </div>
              </div>
            )}

            {codeInfo.type === 'TEACHER_INVITE' && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wide">Teacher Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="First Name" value={teacherForm.name} onChange={v => setTeacherForm(t => ({ ...t, name: v }))} />
                  <InputField label="Last Name" value={teacherForm.surname} onChange={v => setTeacherForm(t => ({ ...t, surname: v }))} />
                  <InputField label="Email" type="email" value={teacherForm.email} onChange={v => setTeacherForm(t => ({ ...t, email: v }))} className="col-span-2" />
                  <InputField label="Username" value={teacherForm.username} onChange={v => setTeacherForm(t => ({ ...t, username: v }))} />
                  <InputField label="Password" type="password" value={teacherForm.password} onChange={v => setTeacherForm(t => ({ ...t, password: v }))} />
                  <InputField label="Phone" value={teacherForm.phone} onChange={v => setTeacherForm(t => ({ ...t, phone: v }))} />
                  <InputField label="Address" value={teacherForm.address} onChange={v => setTeacherForm(t => ({ ...t, address: v }))} />
                  <InputField label="Birthday" type="date" value={teacherForm.birthday} onChange={v => setTeacherForm(t => ({ ...t, birthday: v }))} />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sex</label>
                    <select
                      value={teacherForm.sex}
                      onChange={e => setTeacherForm(t => ({ ...t, sex: e.target.value as 'MALE' | 'FEMALE' | 'OTHER' }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Blood Type</label>
                    <select
                      value={teacherForm.bloodType}
                      onChange={e => setTeacherForm(t => ({ ...t, bloodType: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bt => (
                        <option key={bt} value={bt}>{bt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('code'); setCodeInfo(null); setError(''); }}
                className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-200 transition"
              >
                Back
              </button>
              <button
                onClick={submitJoin}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? 'Joining...' : 'Join School'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type = 'text', className = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
