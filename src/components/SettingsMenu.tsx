/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { GameSettings } from '../types.ts';
import { Volume2, Zap, RotateCcw, X, ShieldAlert, Music } from 'lucide-react';
import { useState } from 'react';
import { soundManager } from '../lib/sounds.ts';

interface SettingsMenuProps {
  settings: GameSettings;
  onUpdate: (settings: GameSettings) => void;
  onReset: () => void;
  onClose: () => void;
  key?: string | number;
}

export default function SettingsMenu({ settings, onUpdate, onReset, onClose }: SettingsMenuProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
    >
      <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[32px] p-8 relative overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold italic tracking-tight">OPTIONS</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Settings List */}
        <div className="space-y-6">
          {/* Volume */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-bold text-slate-400 uppercase tracking-widest">
              <div className="flex items-center gap-2">
                <Volume2 size={16} />
                <span>Volume</span>
              </div>
              <span>{Math.round(settings.volume * 100)}%</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={settings.volume} 
              onChange={(e) => onUpdate({ ...settings, volume: parseFloat(e.target.value) })}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Music Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-center gap-3">
                <Music size={20} className={settings.musicEnabled ? 'text-emerald-400' : 'text-slate-500'} />
                <div>
                  <p className="font-bold">Music</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Background Audio</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  soundManager.play('toggle');
                  onUpdate({ ...settings, musicEnabled: !settings.musicEnabled });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.musicEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <motion.div 
                  animate={{ x: settings.musicEnabled ? 26 : 4 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                />
              </button>
            </div>

            {/* Animations */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-center gap-3">
                <Zap size={20} className={settings.animations ? 'text-amber-400' : 'text-slate-500'} />
                <div>
                  <p className="font-bold">Animations</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">High Quality Effects</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  soundManager.play('toggle');
                  onUpdate({ ...settings, animations: !settings.animations });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.animations ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <motion.div 
                  animate={{ x: settings.animations ? 26 : 4 }}
                  className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                />
              </button>
            </div>
          </div>

          {/* Reset Progress */}
          <div className="pt-4 border-t border-white/5">
            {!showResetConfirm ? (
              <button 
                onClick={() => {
                  soundManager.play('click');
                  setShowResetConfirm(true);
                }}
                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 font-bold hover:bg-red-500/20 transition-all"
              >
                <RotateCcw size={18} />
                <span>Reset All Progress</span>
              </button>
            ) : (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-2xl bg-red-500 text-white"
              >
                <div className="flex items-center gap-3 mb-4">
                  <ShieldAlert size={24} />
                  <p className="font-black italic">ARE YOU SURE?</p>
                </div>
                <p className="text-sm font-medium mb-4 text-red-100">
                  This will permanently delete your level progress and high scores. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      soundManager.play('complete');
                      onReset();
                    }}
                    className="flex-1 py-2 bg-white text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors"
                  >
                    Yes, Reset
                  </button>
                  <button 
                    onClick={() => {
                      soundManager.play('click');
                      setShowResetConfirm(false);
                    }}
                    className="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[10px] text-slate-600 font-bold tracking-[0.2em] uppercase">
          Build v0.4.2-α • Escape Loop
        </p>
      </div>
    </motion.div>
  );
}
