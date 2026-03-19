'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  createGradingScaleAction,
  updateGradingScaleAction,
  deleteGradingScaleAction,
  setDefaultGradingScaleAction,
  createGradeBandAction,
  updateGradeBandAction,
  deleteGradeBandAction,
} from '@/lib/actions/gradingScaleActions';

type Band = {
  id: string;
  label: string;
  abbreviation: string | null;
  minPercentage: number;
  maxPercentage: number;
  color: string | null;
  isPassing: boolean;
  order: number;
  gradingScaleId: string;
};

type Scale = {
  id: string;
  name: string;
  maxScore: number;
  isDefault: boolean;
  schoolId: string;
  bands: Band[];
};

interface GradingScaleClientProps {
  schoolId: string;
  initialScales: Scale[];
}

export default function GradingScaleClient({ schoolId, initialScales }: GradingScaleClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showScaleForm, setShowScaleForm] = useState(false);
  const [editingScale, setEditingScale] = useState<Scale | null>(null);
  const [scaleName, setScaleName] = useState('');
  const [scaleMaxScore, setScaleMaxScore] = useState(100);
  const [scaleIsDefault, setScaleIsDefault] = useState(false);

  const [editingBandScaleId, setEditingBandScaleId] = useState<string | null>(null);
  const [editingBand, setEditingBand] = useState<Band | null>(null);
  const [bandLabel, setBandLabel] = useState('');
  const [bandAbbr, setBandAbbr] = useState('');
  const [bandMin, setBandMin] = useState(0);
  const [bandMax, setBandMax] = useState(100);
  const [bandColor, setBandColor] = useState('#22c55e');
  const [bandIsPassing, setBandIsPassing] = useState(true);
  const [bandOrder, setBandOrder] = useState(0);

  const resetScaleForm = () => {
    setShowScaleForm(false);
    setEditingScale(null);
    setScaleName('');
    setScaleMaxScore(100);
    setScaleIsDefault(false);
  };

  const resetBandForm = () => {
    setEditingBandScaleId(null);
    setEditingBand(null);
    setBandLabel('');
    setBandAbbr('');
    setBandMin(0);
    setBandMax(100);
    setBandColor('#22c55e');
    setBandIsPassing(true);
    setBandOrder(0);
  };

  const openEditScale = (scale: Scale) => {
    setEditingScale(scale);
    setScaleName(scale.name);
    setScaleMaxScore(scale.maxScore);
    setScaleIsDefault(scale.isDefault);
    setShowScaleForm(true);
  };

  const openAddBand = (scaleId: string, nextOrder: number) => {
    resetBandForm();
    setEditingBandScaleId(scaleId);
    setBandOrder(nextOrder);
  };

  const openEditBand = (band: Band) => {
    setEditingBandScaleId(band.gradingScaleId);
    setEditingBand(band);
    setBandLabel(band.label);
    setBandAbbr(band.abbreviation || '');
    setBandMin(band.minPercentage);
    setBandMax(band.maxPercentage);
    setBandColor(band.color || '#22c55e');
    setBandIsPassing(band.isPassing);
    setBandOrder(band.order);
  };

  const handleSaveScale = () => {
    if (!scaleName.trim()) { toast.error('Name is required'); return; }
    startTransition(async () => {
      try {
        if (editingScale) {
          await updateGradingScaleAction({ id: editingScale.id, schoolId, name: scaleName, maxScore: scaleMaxScore, isDefault: scaleIsDefault });
          toast.success('Scale updated');
        } else {
          await createGradingScaleAction({ schoolId, name: scaleName, maxScore: scaleMaxScore, isDefault: scaleIsDefault });
          toast.success('Scale created');
        }
        resetScaleForm();
        router.refresh();
      } catch (e: any) { toast.error(e.message); }
    });
  };

  const handleDeleteScale = (id: string) => {
    if (!confirm('Delete this entire grading scale and all its bands?')) return;
    startTransition(async () => {
      try {
        await deleteGradingScaleAction(id, schoolId);
        toast.success('Scale deleted');
        router.refresh();
      } catch (e: any) { toast.error(e.message); }
    });
  };

  const handleSetDefault = (id: string) => {
    startTransition(async () => {
      try {
        await setDefaultGradingScaleAction(id, schoolId);
        toast.success('Default scale updated');
        router.refresh();
      } catch (e: any) { toast.error(e.message); }
    });
  };

  const handleSaveBand = () => {
    if (!bandLabel.trim() || !editingBandScaleId) { toast.error('Label is required'); return; }
    startTransition(async () => {
      try {
        const payload = {
          schoolId,
          gradingScaleId: editingBandScaleId!,
          label: bandLabel,
          abbreviation: bandAbbr || undefined,
          minPercentage: bandMin,
          maxPercentage: bandMax,
          color: bandColor || undefined,
          isPassing: bandIsPassing,
          order: bandOrder,
        };
        if (editingBand) {
          await updateGradeBandAction({ ...payload, id: editingBand.id });
          toast.success('Band updated');
        } else {
          await createGradeBandAction(payload);
          toast.success('Band added');
        }
        resetBandForm();
        router.refresh();
      } catch (e: any) { toast.error(e.message); }
    });
  };

  const handleDeleteBand = (id: string) => {
    if (!confirm('Delete this grade band?')) return;
    startTransition(async () => {
      try {
        await deleteGradeBandAction(id, schoolId);
        toast.success('Band deleted');
        router.refresh();
      } catch (e: any) { toast.error(e.message); }
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Grading Scales</h1>
        <button
          onClick={() => { resetScaleForm(); setShowScaleForm(true); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={isPending}
        >
          Create Scale
        </button>
      </div>

      {showScaleForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 shadow-sm">
          <h3 className="font-semibold mb-3">{editingScale ? 'Edit Scale' : 'New Grading Scale'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={scaleName} onChange={e => setScaleName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="e.g. French System" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
              <input type="number" value={scaleMaxScore} onChange={e => setScaleMaxScore(Number(e.target.value))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={scaleIsDefault} onChange={e => setScaleIsDefault(e.target.checked)} className="rounded" />
                Set as default
              </label>
            </div>
          </div>
          <div className="mt-4 flex gap-2 justify-end">
            <button onClick={resetScaleForm} className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveScale} disabled={isPending} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
              {isPending ? 'Saving...' : editingScale ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {initialScales.length === 0 && !showScaleForm ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
          <p className="font-medium">No grading scales yet</p>
          <p className="text-sm mt-1">Click &ldquo;Create Scale&rdquo; to get started.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {initialScales.map(scale => (
            <div key={scale.id} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">{scale.name}</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600">Max: <span className="font-medium">{scale.maxScore}</span></span>
                    {scale.isDefault && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">Default</span>
                    )}
                    {!scale.isDefault && (
                      <button onClick={() => handleSetDefault(scale.id)} disabled={isPending} className="text-xs text-blue-600 hover:underline disabled:opacity-50">Set Default</button>
                    )}
                    <button onClick={() => openEditScale(scale)} disabled={isPending} className="text-xs text-gray-600 hover:underline disabled:opacity-50">Edit</button>
                    <button onClick={() => handleDeleteScale(scale.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Delete</button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Label</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Abbr.</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Min%</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Max%</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Color</th>
                      <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Passing</th>
                      <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {scale.bands.map(band => (
                      <tr key={band.id} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{band.label}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{band.abbreviation || '—'}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{band.minPercentage}</td>
                        <td className="px-5 py-3 text-sm text-gray-600">{band.maxPercentage}</td>
                        <td className="px-5 py-3">
                          {band.color ? (
                            <span className="inline-block w-6 h-6 rounded border border-gray-300" style={{ backgroundColor: band.color }} title={band.color} />
                          ) : <span className="text-gray-400 text-sm">—</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${band.isPassing ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {band.isPassing ? 'Passing' : 'Failing'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right space-x-2">
                          <button onClick={() => openEditBand(band)} disabled={isPending} className="text-xs text-gray-600 hover:underline disabled:opacity-50">Edit</button>
                          <button onClick={() => handleDeleteBand(band.id)} disabled={isPending} className="text-xs text-red-600 hover:underline disabled:opacity-50">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {scale.bands.length === 0 && (
                      <tr><td colSpan={7} className="px-5 py-4 text-center text-sm text-gray-400">No bands defined yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {editingBandScaleId === scale.id ? (
                <div className="border-t border-gray-200 p-5 bg-gray-50">
                  <h4 className="font-semibold text-sm mb-3">{editingBand ? 'Edit Band' : 'Add Band'}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                      <input type="text" value={bandLabel} onChange={e => setBandLabel(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. Excellent" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Abbreviation</label>
                      <input type="text" value={bandAbbr} onChange={e => setBandAbbr(e.target.value)} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" placeholder="e.g. A+" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Min %</label>
                      <input type="number" value={bandMin} onChange={e => setBandMin(Number(e.target.value))} min={0} max={100} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max %</label>
                      <input type="number" value={bandMax} onChange={e => setBandMax(Number(e.target.value))} min={0} max={100} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                      <input type="color" value={bandColor} onChange={e => setBandColor(e.target.value)} className="w-full h-8 border border-gray-300 rounded-md cursor-pointer" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Order</label>
                      <input type="number" value={bandOrder} onChange={e => setBandOrder(Number(e.target.value))} min={0} className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={bandIsPassing} onChange={e => setBandIsPassing(e.target.checked)} className="rounded" />
                        Passing
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 justify-end">
                    <button onClick={resetBandForm} className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSaveBand} disabled={isPending} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                      {isPending ? 'Saving...' : editingBand ? 'Update Band' : 'Add Band'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-200 p-3">
                  <button
                    onClick={() => openAddBand(scale.id, scale.bands.length)}
                    disabled={isPending}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    + Add Band
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
