import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Mail, Shield, Save, Loader2, Sparkles, AlertCircle, Eye } from 'lucide-react';
import { motion } from 'motion/react';

export default function EmailSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  const [sustainability, setSustainability] = useState({
    showMessage: true,
    message: 'HomeManager is built with love by an independent developer. If you find it valuable, consider supporting the journey!',
    donationDetails: 'Donate via BuyMeACoffee or PayPal'
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const snap = await getDoc(doc(db, 'settings', 'email'));
        if (snap.exists()) {
          setSustainability(snap.data().sustainability || sustainability);
        }
      } catch (err) {
        console.error('Error loading email settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'email'), {
        sustainability,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving email settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="animate-spin text-indigo-600" size={32} />
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
            <Mail size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900">Email Experience</h3>
            <p className="text-slate-500 font-medium text-sm">Control what your family sees in their inbox</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <Sparkles className="text-amber-500" size={20} />
              <div>
                <p className="font-black text-slate-900 text-sm italic">Include Sustainability Message</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Added to the bottom of every system email</p>
              </div>
            </div>
            <button 
              onClick={() => setSustainability(s => ({ ...s, showMessage: !s.showMessage }))}
              className={`w-12 h-6 rounded-full transition-all relative ${sustainability.showMessage ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${sustainability.showMessage ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {sustainability.showMessage && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 pt-2"
            >
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Message Body</label>
                <textarea
                  value={sustainability.message}
                  onChange={(e) => setSustainability(s => ({ ...s, message: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium h-32 resize-none text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Donation / Support Link Details</label>
                <input
                  type="text"
                  value={sustainability.donationDetails}
                  onChange={(e) => setSustainability(s => ({ ...s, donationDetails: e.target.value }))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                  placeholder="BuyMeACoffee.com/MyFamily"
                />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 flex items-start gap-4">
        <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
          <AlertCircle size={20} />
        </div>
        <div>
          <h4 className="font-black text-amber-900 text-sm">Pro Tip: Personalize your templates!</h4>
          <p className="text-amber-800/70 text-xs font-medium mt-1 leading-relaxed">
            System emails help keep everyone in the loop. Adding a custom message at the bottom adds a nice personal touch to your child's milestones.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 text-white font-black px-10 py-5 rounded-3xl flex items-center gap-3 hover:bg-slate-900 active:scale-95 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
          Save Email Settings
        </button>
        {success && (
          <p className="text-emerald-600 font-bold flex items-center gap-2 animate-bounce">
            ✅ Settings updated!
          </p>
        )}
      </div>

      <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <div className="relative z-10">
          <h4 className="text-white font-black text-xl mb-6 flex items-center gap-2">
            <Eye className="text-indigo-400" />
            Email Preview
          </h4>

          <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-white/10 max-w-lg mx-auto">
            <div className="bg-indigo-600 p-4 text-center">
              <h1 className="text-white font-black text-lg">🏠 HomeManager</h1>
            </div>
            <div className="p-8">
              <div className="w-12 h-1 w-1/3 bg-slate-100 mb-6 rounded-full" />
              <div className="space-y-3 mb-8">
                <div className="h-4 bg-slate-50 w-full rounded" />
                <div className="h-4 bg-slate-50 w-5/6 rounded" />
                <div className="h-4 bg-slate-50 w-4/6 rounded" />
              </div>

              {sustainability.showMessage && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 text-center">
                  <div className="text-xl mb-2">💛</div>
                  <h5 className="font-black text-amber-900 text-xs uppercase mb-1">Support HomeManager</h5>
                  <p className="text-[11px] text-amber-800/70 font-medium mb-3 leading-relaxed">
                    {sustainability.message || '...'}
                  </p>
                  <p className="text-[10px] font-black text-amber-900">
                    {sustainability.donationDetails || '...'}
                  </p>
                </div>
              )}

              <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Sent by HomeManager · Teamwork
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
