'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  savePromotionRulesAction,
  generatePromotionSuggestions,
  applyPromotionsAction,
  type PromotionDecision,
  type StudentPromotionSuggestion,
} from '@/lib/actions/promotionActions';

interface Props {
  schoolId: string;
  academicYears: { id: string; name: string; startDate: string; endDate: string; isArchived: boolean }[];
  grades: { id: number; level: string }[];
  classes: { id: number; name: string; gradeId: number; academicYearId: string }[];
  existingRules: {
    id: string;
    academicYearId: string;
    academicYearName: string;
    gradeId: number | null;
    gradeLevel: string;
    passingThreshold: number;
    minimumOverallAverage: number;
    maxFailedSubjects: number;
    minimumAttendance: number;
    borderlineMargin: number;
  }[];
}

export default function PromotionsClient({ schoolId, academicYears, grades, classes, existingRules }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<'rules' | 'review'>('rules');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedAY, setSelectedAY] = useState(academicYears[0]?.id ?? '');
  const [selectedGradeId, setSelectedGradeId] = useState<number | undefined>();
  const [ruleForm, setRuleForm] = useState({
    passingThreshold: 50,
    minimumOverallAverage: 50,
    maxFailedSubjects: 2,
    minimumAttendance: 75,
    borderlineMargin: 5,
  });

  const [suggestions, setSuggestions] = useState<StudentPromotionSuggestion[]>([]);
  const [decisions, setDecisions] = useState<Record<string, { decision: PromotionDecision; targetClassId?: number }>>({});
  const [targetAY, setTargetAY] = useState('');
  const [reviewAY, setReviewAY] = useState(academicYears[0]?.id ?? '');

  const handleLoadRule = (rule: Props['existingRules'][0]) => {
    setSelectedAY(rule.academicYearId);
    setSelectedGradeId(rule.gradeId ?? undefined);
    setRuleForm({
      passingThreshold: rule.passingThreshold,
      minimumOverallAverage: rule.minimumOverallAverage,
      maxFailedSubjects: rule.maxFailedSubjects,
      minimumAttendance: rule.minimumAttendance,
      borderlineMargin: rule.borderlineMargin,
    });
  };

  const handleSaveRule = () => {
    setError(''); setSuccess('');
    startTransition(async () => {
      const result = await savePromotionRulesAction({
        schoolId,
        academicYearId: selectedAY,
        gradeId: selectedGradeId,
        ...ruleForm,
      });
      if (result.success) {
        setSuccess(result.message);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const handleGenerate = () => {
    setError(''); setSuccess(''); setSuggestions([]);
    startTransition(async () => {
      const result = await generatePromotionSuggestions(schoolId, reviewAY);
      if (result.success && result.suggestions) {
        setSuggestions(result.suggestions);
        const initialDecisions: Record<string, { decision: PromotionDecision; targetClassId?: number }> = {};
        for (const s of result.suggestions) {
          initialDecisions[s.studentId] = { decision: s.suggestedDecision };
        }
        setDecisions(initialDecisions);
      } else {
        setError(result.message || 'Failed to generate suggestions.');
      }
    });
  };

  const handleApply = () => {
    if (!targetAY) {
      setError('Please select a target academic year for promoted students.');
      return;
    }
    setError(''); setSuccess('');
    startTransition(async () => {
      const decisionsArr = Object.entries(decisions).map(([studentId, d]) => ({
        studentId,
        decision: d.decision,
        targetClassId: d.targetClassId,
      }));

      const result = await applyPromotionsAction({
        schoolId,
        academicYearId: reviewAY,
        targetAcademicYearId: targetAY,
        decisions: decisionsArr,
      });

      if (result.success) {
        setSuccess(result.message);
        setSuggestions([]);
        setDecisions({});
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const targetClasses = classes.filter(c => c.academicYearId === targetAY);

  const decisionColors: Record<PromotionDecision, string> = {
    PROMOTED: 'bg-green-100 text-green-800',
    RETAINED: 'bg-red-100 text-red-800',
    BORDERLINE: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Promotions & Retention</h1>
      <p className="text-gray-500 mb-6">Configure promotion rules and manage year-end student promotions.</p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'rules' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Promotion Rules
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Year-End Review
        </button>
      </div>

      {activeTab === 'rules' && (
        <div>
          {existingRules.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Existing Rules</h3>
              <div className="space-y-2">
                {existingRules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                    <div>
                      <span className="font-medium text-sm">{rule.academicYearName}</span>
                      <span className="text-gray-500 text-sm ml-2">&middot; {rule.gradeLevel}</span>
                      <span className="text-gray-400 text-xs ml-2">
                        Avg &ge; {rule.minimumOverallAverage}% | Max {rule.maxFailedSubjects} fails | Attendance &ge; {rule.minimumAttendance}%
                      </span>
                    </div>
                    <button
                      onClick={() => handleLoadRule(rule)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold mb-4">Configure Promotion Rule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <select value={selectedAY} onChange={e => setSelectedAY(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade (blank = applies to all)</label>
                <select value={selectedGradeId ?? ''} onChange={e => setSelectedGradeId(e.target.value ? parseInt(e.target.value) : undefined)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">All Grades (default)</option>
                  {grades.map(g => <option key={g.id} value={g.id}>{g.level}</option>)}
                </select>
              </div>
              <NumberField label="Passing Threshold (%)" value={ruleForm.passingThreshold} onChange={v => setRuleForm(f => ({ ...f, passingThreshold: v }))} />
              <NumberField label="Min Overall Average (%)" value={ruleForm.minimumOverallAverage} onChange={v => setRuleForm(f => ({ ...f, minimumOverallAverage: v }))} />
              <NumberField label="Max Failed Subjects" value={ruleForm.maxFailedSubjects} onChange={v => setRuleForm(f => ({ ...f, maxFailedSubjects: v }))} />
              <NumberField label="Min Attendance (%)" value={ruleForm.minimumAttendance} onChange={v => setRuleForm(f => ({ ...f, minimumAttendance: v }))} />
              <NumberField label="Borderline Margin (%)" value={ruleForm.borderlineMargin} onChange={v => setRuleForm(f => ({ ...f, borderlineMargin: v }))} />
            </div>
            <button
              onClick={handleSaveRule}
              disabled={isPending}
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {isPending ? 'Saving...' : 'Save Rule'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Academic Year</label>
                <select value={reviewAY} onChange={e => setReviewAY(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {academicYears.map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Academic Year (for promoted students)</label>
                <select value={targetAY} onChange={e => setTargetAY(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {academicYears.filter(ay => ay.id !== reviewAY).map(ay => <option key={ay.id} value={ay.id}>{ay.name}</option>)}
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isPending}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {isPending ? 'Generating...' : 'Generate Suggestions'}
              </button>
            </div>
          </div>

          {suggestions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="font-medium text-sm text-gray-700">
                  {suggestions.length} student(s) &middot;{' '}
                  <span className="text-green-700">{Object.values(decisions).filter(d => d.decision === 'PROMOTED').length} promote</span> &middot;{' '}
                  <span className="text-red-700">{Object.values(decisions).filter(d => d.decision === 'RETAINED').length} retain</span> &middot;{' '}
                  <span className="text-yellow-700">{Object.values(decisions).filter(d => d.decision === 'BORDERLINE').length} borderline</span>
                </span>
                <button
                  onClick={handleApply}
                  disabled={isPending || !targetAY}
                  className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                >
                  {isPending ? 'Applying...' : 'Apply Decisions'}
                </button>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Student</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Class</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Average</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Failed</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Attendance</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Suggestion</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Decision</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Target Class</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map(s => {
                    const d = decisions[s.studentId];
                    return (
                      <tr key={s.studentId} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-2.5 text-sm font-medium">{s.studentName}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-600">{s.className}</td>
                        <td className="px-4 py-2.5 text-sm">{s.overallAverage.toFixed(1)}%</td>
                        <td className="px-4 py-2.5 text-sm">{s.failedSubjectCount}</td>
                        <td className="px-4 py-2.5 text-sm">{s.attendanceRate.toFixed(1)}%</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${decisionColors[s.suggestedDecision]}`}>
                            {s.suggestedDecision}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate" title={s.reason}>{s.reason}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={d?.decision ?? 'BORDERLINE'}
                            onChange={e => setDecisions(prev => ({
                              ...prev,
                              [s.studentId]: { ...prev[s.studentId], decision: e.target.value as PromotionDecision },
                            }))}
                            className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                          >
                            <option value="PROMOTED">Promote</option>
                            <option value="RETAINED">Retain</option>
                            <option value="BORDERLINE">Borderline</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          {d?.decision === 'PROMOTED' && (
                            <select
                              value={d.targetClassId ?? ''}
                              onChange={e => setDecisions(prev => ({
                                ...prev,
                                [s.studentId]: { ...prev[s.studentId], targetClassId: e.target.value ? parseInt(e.target.value) : undefined },
                              }))}
                              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                            >
                              <option value="">Select class...</option>
                              {targetClasses.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
