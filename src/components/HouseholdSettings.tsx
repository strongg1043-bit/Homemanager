import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Household } from '../types';
import { 
  Settings, 
  Coins, 
  DollarSign, 
  Euro, 
  PoundSterling, 
  Banknote, 
  Info, 
  Save, 
  Loader2 
} from 'lucide-react';

interface HouseholdSettingsProps {
  household: Household;
}

const PRESET_CURRENCIES = [
  { symbol: 'R', name: 'Rand' },
  { symbol: '$', name: 'Dollar' },
  { symbol: '€', name: 'Euro' },
  { symbol: '£', name: 'Pound' }
];

export default function HouseholdSettings({ household }: HouseholdSettingsProps) {
  const [currency, setCurrency] = useState(household.currency);
  const [currencyName, setCurrencyName] = useState(household.currencyName);
  const [cashOutEnabled, setCashOutEnabled] = useState(household.cashOutEnabled);
  const [minCashOut, setMinCashOut] = useState(household.minCashOut);
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      await updateDoc(doc(db, 'households', household.id), {
        currency: currency.trim(),
        currencyName: currencyName.trim(),
        cashOutEnabled,
        minCashOut: Number(minCashOut)
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      {/* Currency Section */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
            <Coins size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Currency Settings</h3>
            <p className="text-sm text-slate-500 font-medium">How points are valued in your household</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Preset Currencies</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PRESET_CURRENCIES.map((preset) => (
              <button
                key={preset.symbol}
                onClick={() => {
                  setCurrency(preset.symbol);
                  setCurrencyName(preset.name);
                }}
                className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
                  currency === preset.symbol 
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                    : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-300'
                }`}
              >
                {preset.symbol} ({preset.name})
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Symbol</label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              placeholder="e.g. R"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Currency Name</label>
            <input
              type="text"
              value={currencyName}
              onChange={(e) => setCurrencyName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
              placeholder="e.g. Rand"
            />
          </div>
        </div>

        <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-center gap-3">
          <div className="p-2 bg-white text-indigo-600 rounded-lg shadow-sm border border-indigo-100 font-black">
            1 pt = {currency}1
          </div>
          <p className="text-xs text-indigo-700 font-medium italic">
            Each point earned by your children will be worth exactly 1 {currencyName}.
          </p>
        </div>
      </div>

      {/* Cash Out Section */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
              <Banknote size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Cash Economy</h3>
              <p className="text-sm text-slate-500 font-medium">Allow children to cash out points</p>
            </div>
          </div>
          <button 
            onClick={() => setCashOutEnabled(!cashOutEnabled)}
            className={`w-14 h-8 rounded-full transition-all relative ${cashOutEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${cashOutEnabled ? 'left-7 shadow-lg' : 'left-1'}`} />
          </button>
        </div>

        {cashOutEnabled && (
          <div className="space-y-6 pt-6 border-t border-slate-100">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Minimum Cash Out (Points)</label>
              <input
                type="number"
                value={minCashOut}
                onChange={(e) => setMinCashOut(Number(e.target.value))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold"
                placeholder="50"
              />
              <p className="text-xs text-slate-400 pl-1 mt-2 flex items-center gap-1">
                <Info size={12} /> Children must have at least this many points to request cash.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={loading}
          className="bg-indigo-600 text-white font-black px-10 py-5 rounded-3xl flex items-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save size={24} />}
          Save Changes
        </button>
        {saveSuccess && (
          <p className="text-emerald-600 font-bold flex items-center gap-2 animate-bounce">
            <Info size={20} /> Settings saved!
          </p>
        )}
      </div>
    </div>
  );
}
