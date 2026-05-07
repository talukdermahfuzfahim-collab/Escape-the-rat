/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { GameMode, LeaderboardEntry, UserProfile } from '../types.ts';
import { Play, Calendar, Zap, Trophy, MousePointer2, ChevronRight, ChevronLeft, BarChart3, History, Target, Flame, X, Info, Infinity, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getTopScores } from '../services/gameService.ts';
import { soundManager } from '../lib/sounds.ts';

interface MainMenuProps {
  onSelectMode: (mode: GameMode, level?: number, score?: number, timeLeft?: number) => void;
  profile: UserProfile | null;
  key?: string | number;
}

export default function MainMenu({ onSelectMode, profile }: MainMenuProps) {
  const [topScores, setTopScores] = useState<LeaderboardEntry[]>([]);
  const [statsCategory, setStatsCategory] = useState<'endless' | 'levels'>('endless');
  const [selectedLevel, setSelectedLevel] = useState(profile?.levelProgress || 1);
  const [showStats, setShowStats] = useState(false);
  const [showLevelTooltip, setShowLevelTooltip] = useState(false);

  useEffect(() => {
    setSelectedLevel(profile?.levelProgress || 1);
  }, [profile]);

  useEffect(() => {
    const fetchScores = async () => {
      const scores = await getTopScores(statsCategory);
      setTopScores(scores);
    };
    fetchScores();
  }, [statsCategory]);

  const calculateStreak = (dates: string[]) => {
    if (!dates || dates.length === 0) return 0;
    
    // Sort dates descending
    const sortedDates = [...dates].sort().reverse();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // If the most recent completion wasn't today or yesterday, streak is broken
    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) return 0;
    
    let streak = 0;
    let currentDate = new Date(sortedDates[0]);
    
    for (const dateStr of sortedDates) {
      const date = new Date(dateStr);
      const diff = Math.floor((currentDate.getTime() - date.getTime()) / 86400000);
      
      if (diff === 1 || diff === 0) {
        if (diff === 1) streak++;
        currentDate = date;
      } else {
        break;
      }
    }
    
    // Adjust for the first date in the loop
    return dates.length > 0 ? streak + 1 : 0;
  };

  const streak = profile ? calculateStreak(profile.dailyCompleted) : 0;

  const modes = [
    {
      id: GameMode.LEVEL,
      title: 'Level Mode',
      description: 'Handcrafted puzzles with progressive difficulty.',
      icon: <Layers className="w-8 h-8" />,
      titleIcon: <Layers size={20} className="text-emerald-500/50" />,
      color: 'from-emerald-500 to-teal-600',
      tag: 'Progressive'
    },
    {
      id: GameMode.DAILY,
      title: 'Daily Challenge',
      description: 'One unique puzzle every day. Can you stay consistent?',
      icon: <Calendar className="w-8 h-8" />,
      titleIcon: <Calendar size={20} className="text-blue-500/50" />,
      color: 'from-blue-500 to-indigo-600',
      tag: 'Timed'
    },
    {
      id: GameMode.ENDLESS,
      title: 'Endless Loop',
      description: 'How many rooms can you escape before making a mistake?',
      icon: <Infinity className="w-8 h-8" />,
      titleIcon: <Infinity size={20} className="text-amber-500/50" />,
      color: 'from-amber-500 to-orange-600',
      tag: 'High Score'
    }
  ];

  return (
    <div className="w-full flex flex-col items-center">
      {/* Resume Session */}
      {profile?.currentSession && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl p-6 mb-8 rounded-[32px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-emerald-950">
              <History size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/60">Paused Session</p>
              <h3 className="text-xl font-black italic">{profile.currentSession.mode.toUpperCase()} - ROOM {profile.currentSession.level}</h3>
              <p className="text-xs text-slate-400">Score: {profile.currentSession.score} • Saved {new Date(profile.currentSession.updatedAt).toLocaleTimeString()}</p>
            </div>
          </div>
          
          <button 
            onClick={() => {
              soundManager.play('click');
              const session = profile.currentSession!;
              onSelectMode(session.mode, session.level, session.score, session.timeLeft);
            }}
            className="flex items-center gap-2 px-8 py-3 bg-emerald-500 text-emerald-950 rounded-2xl font-black italic text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <span>RESUME ESCAPE</span>
            <ChevronRight size={18} />
          </button>
        </motion.div>
      )}

      {/* Top Banner / Stats Entry */}
      {profile && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl flex items-center justify-between mb-8 p-6 rounded-[32px] bg-white/5 border border-white/5 backdrop-blur-sm"
        >
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Trophy size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Your Progress</p>
                <h3 className="text-xl font-black italic">ROOM {profile.levelProgress}</h3>
              </div>
            </div>

            {streak > 0 && (
              <div className="flex items-center gap-4 pl-6 border-l border-white/5">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Flame size={24} className={streak > 0 ? 'animate-pulse' : ''} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Daily Streak</p>
                  <h3 className="text-xl font-black italic text-orange-500">{streak} DAYS</h3>
                </div>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => {
              soundManager.play('click');
              setShowStats(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-emerald-950 rounded-2xl font-black italic text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
          >
            <BarChart3 size={18} />
            <span>PLAYER STATS</span>
          </button>
        </motion.div>
      )}

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6"
      >
      {modes.map((mode, idx) => (
        <motion.div
          key={mode.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          whileHover={{ y: -8, scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => mode.id === GameMode.LEVEL ? onSelectMode(mode.id, selectedLevel) : onSelectMode(mode.id)}
          className="relative group flex flex-col items-start p-8 rounded-3xl bg-white/5 border border-white/5 hover:border-white/10 transition-all text-left overflow-hidden cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              mode.id === GameMode.LEVEL ? onSelectMode(mode.id, selectedLevel) : onSelectMode(mode.id);
            }
          }}
        >
          {/* Subtle Glow */}
          <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${mode.color} opacity-0 group-hover:opacity-20 blur-3xl transition-opacity`} />
          
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${mode.color} flex items-center justify-center text-white mb-6 shadow-xl`}>
            {mode.icon}
          </div>
          
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-500 mb-2">{mode.tag}</span>
          <h2 className="text-2xl font-bold mb-3 flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              {(mode as any).titleIcon}
              {mode.title}
            </span>
            {mode.id === GameMode.DAILY && streak > 0 && (
              <span className="px-2 py-0.5 bg-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-widest rounded-lg border border-orange-500/20 flex items-center gap-1">
                <Flame size={12} />
                {streak}
              </span>
            )}
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            {mode.description}
          </p>

          {mode.id === GameMode.LEVEL && profile && (
            <div 
              className="w-full mb-6 p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between"
              onClick={(e) => e.stopPropagation()} // Prevent card click
            >
              <button 
                disabled={selectedLevel <= 1}
                onClick={() => setSelectedLevel(prev => Math.max(1, prev - 1))}
                className="p-1 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <div 
                className="text-center flex-1 relative"
                onMouseEnter={() => setShowLevelTooltip(true)}
                onMouseLeave={() => setShowLevelTooltip(false)}
              >
                <div className="flex items-center justify-center gap-1 group/info cursor-help">
                  <p className="text-[10px] font-black italic text-emerald-500 uppercase tracking-widest">Starting Room</p>
                  <Info size={10} className="text-emerald-500/40 group-hover/info:text-emerald-500 transition-colors" />
                </div>
                <p className="text-xl font-black italic">{selectedLevel}</p>

                <AnimatePresence>
                  {showLevelTooltip && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-4 bg-slate-800 border border-white/10 rounded-2xl shadow-2xl z-50 pointer-events-none"
                    >
                      <p className="text-[10px] font-bold text-slate-300 leading-relaxed uppercase tracking-[0.1em]">
                        You can start from any level you've previously reached.
                      </p>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-slate-800" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <button 
                disabled={selectedLevel >= profile.levelProgress}
                onClick={() => setSelectedLevel(prev => Math.min(profile.levelProgress, prev + 1))}
                className="p-1 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <span>Play Now</span>
            <MousePointer2 size={16} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </motion.div>
      ))}

      {/* Leaderboard Preview (Compact) */}
      <div className="md:col-span-3 mt-8 p-6 rounded-3xl bg-white/5 border border-white/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Trophy className={statsCategory === 'endless' ? 'text-amber-400' : 'text-emerald-400'} />
            <h3 className="font-bold flex items-center gap-2">
              <span className="capitalize">{statsCategory}</span> mode Leaders
            </h3>
          </div>

          <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/5">
            <button 
              onClick={() => {
                soundManager.play('click');
                setStatsCategory('endless');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                statsCategory === 'endless' ? 'bg-amber-500 text-amber-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Endless
            </button>
            <button 
              onClick={() => {
                soundManager.play('click');
                setStatsCategory('levels');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                statsCategory === 'levels' ? 'bg-emerald-500 text-emerald-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Levels
            </button>
          </div>
          
          {profile && (
            <button 
              onClick={() => {
                soundManager.play('click');
                setShowStats(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/5 text-xs font-bold uppercase tracking-widest"
            >
              <BarChart3 size={16} />
              <span>Your Stats</span>
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topScores.length > 0 ? topScores.map((score, i) => (
            <div key={score.uid} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
              <span className="text-xs font-bold text-slate-500">#{i + 1}</span>
              <img 
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${score.uid}`} 
                className="w-8 h-8 rounded-lg bg-slate-800"
                alt="avatar"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{score.displayName}</p>
                <p className={`text-[10px] font-mono ${statsCategory === 'endless' ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {statsCategory === 'endless' ? `Score ${score.score}` : `Room ${score.score}`}
                </p>
              </div>
            </div>
          )) : (
            <div className="col-span-full py-8 text-center text-slate-500 text-sm italic">
              No top scores yet for {statsCategory} mode. Be the first!
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showStats && profile && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-[32px] p-8 relative overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black italic tracking-tight">PLAYER PROFILE</h2>
                <button 
                  onClick={() => {
                    soundManager.play('click');
                    setShowStats(false);
                  }}
                  className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex items-center gap-6 mb-8 p-6 rounded-2xl bg-gradient-to-br from-white/5 to-transparent border border-white/5">
                <img 
                  src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} 
                  className="w-20 h-20 rounded-2xl bg-slate-800 ring-2 ring-emerald-500/20"
                  alt="profile"
                />
                <div>
                  <h3 className="text-xl font-bold">{profile.displayName}</h3>
                  <p className="text-sm text-slate-500 mb-2">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/20">
                      Level {profile.levelProgress}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Target size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Levels Complete</span>
                  </div>
                  <p className="text-2xl font-black italic">{profile.levelProgress - 1}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-2 text-slate-500 mb-1">
                    <Zap size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Best Run</span>
                  </div>
                  <p className="text-2xl font-black italic text-amber-400">{profile.endlessHighScore}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 col-span-2 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Flame size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Daily Streak</span>
                    </div>
                    <p className="text-2xl font-black italic text-orange-500">{streak} Days</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2 h-6 rounded-full ${i < streak % 7 ? 'bg-orange-500' : 'bg-slate-800'}`} 
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-white/5">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">
                  <span>Game Milestones</span>
                  <span>{Math.floor((profile.levelProgress / 50) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (profile.levelProgress / 50) * 100)}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </div>
  );
}
