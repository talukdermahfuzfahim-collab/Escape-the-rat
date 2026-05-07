/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameMode, RoomConfig, GameSettings } from '../types.ts';
import { ChevronLeft, RotateCcw, AlertTriangle, ShieldCheck, Timer, Pause, Play, Lightbulb } from 'lucide-react';
import { updateLevelProgress, updateEndlessHighScore, updateDailyCompletion, saveGameSession, clearGameSession } from '../services/gameService.ts';
import { auth } from '../lib/firebase.ts';
import { soundManager } from '../lib/sounds.ts';

interface GameViewProps {
  mode: GameMode;
  onExit: () => void;
  initialLevel?: number;
  initialScore?: number;
  initialTimeLeft?: number;
  settings: GameSettings;
  key?: string | number;
}

export default function GameView({ 
  mode, 
  onExit, 
  initialLevel = 1, 
  initialScore = 0,
  initialTimeLeft,
  settings 
}: GameViewProps) {
  const [level, setLevel] = useState(initialLevel);
  const [score, setScore] = useState(initialScore);
  const [room, setRoom] = useState<RoomConfig | null>(null);
  const [status, setStatus] = useState<'playing' | 'success' | 'failed' | 'resetting'>('playing');
  const [isPaused, setIsPaused] = useState(false);
  const [selectedDoor, setSelectedDoor] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft !== undefined ? initialTimeLeft : (mode === GameMode.ENDLESS ? 10 : 0));

  // Level Generator
  const generateRoom = useCallback((currentLevel: number): RoomConfig => {
    // For Daily Mode, use date as seed for deterministic randomness
    let seed = currentLevel;
    if (mode === GameMode.DAILY) {
      const today = new Date();
      seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate() + currentLevel;
    }

    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const doorCount = Math.min(6, 2 + Math.floor(currentLevel / 5));
    const correctDoor = Math.floor(pseudoRandom() * doorCount);
    const doorNum = correctDoor + 1;
    
    // Add logic/clues based on level
    let hint = '';
    if (currentLevel > 3) {
      const possibleHints: string[] = [];
      
      // Basic Hints (Level 4+)
      if (doorNum % 2 === 0) possibleHints.push('The path is even');
      else possibleHints.push('The path is odd');

      if (correctDoor < doorCount / 2) possibleHints.push('Look to the left');
      else possibleHints.push('Look to the right');

      // Intermediate Hints (Level 10+)
      if (currentLevel >= 10) {
        if (doorNum === 2 || doorNum === 3 || doorNum === 5) possibleHints.push('Follow the prime numbers');
        if (doorNum % 3 === 0) possibleHints.push('It is a multiple of 3');
        if (correctDoor > 0 && correctDoor < doorCount - 1) possibleHints.push('The edges are dangerous');
      }

      // Advanced Hints (Level 20+)
      if (currentLevel >= 20) {
        if (correctDoor === 0) possibleHints.push('The first shall be first');
        if (correctDoor === doorCount - 1) possibleHints.push('The end is the beginning');
        if (doorNum > 3) possibleHints.push('The answer is high');
        else possibleHints.push('The answer is low');
      }

      // Select a hint based on level difficulty (prefer later hints in the list if available at high levels)
      const levelFactor = Math.min(possibleHints.length - 1, Math.floor(pseudoRandom() * possibleHints.length));
      hint = possibleHints[levelFactor];
    }

    return {
      id: currentLevel,
      doors: doorCount,
      correctDoor,
      hint,
      trapType: currentLevel > 2 ? 'reset' : 'none'
    };
  }, [mode]);

  useEffect(() => {
    setRoom(generateRoom(level));
    // Only reset time if it's a new level and we're NOT resuming (initialTimeLeft check)
    // Actually, always reset time on level up in endless mode
    if (mode === GameMode.ENDLESS && status === 'playing' && initialTimeLeft === undefined) {
      setTimeLeft(10);
    }
  }, [level, generateRoom, mode, status]);

  // Auto-save session on unmount or level up
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || status !== 'playing') return;

    const saveSession = async () => {
      await saveGameSession(user.uid, {
        mode,
        level,
        score,
        timeLeft
      });
    };

    // Save on changes (every 5 seconds or on significant events)
    const interval = setInterval(saveSession, 5000);

    return () => {
      clearInterval(interval);
      // Final save on unmount if still playing
      if (status === 'playing') {
        saveSession();
      }
    };
  }, [mode, level, score, timeLeft, status]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'p' && status === 'playing') {
        setIsPaused((prev) => !prev);
        soundManager.play('click');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  // Timer logic for endless mode
  useEffect(() => {
    if (mode === GameMode.ENDLESS && status === 'playing' && timeLeft > 0 && !isPaused) {
      const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && mode === GameMode.ENDLESS && status === 'playing') {
      setStatus('failed');
      handleGameEnd();
    }
  }, [timeLeft, mode, status]);

  const handleGameEnd = async () => {
    const user = auth.currentUser;
    if (!user) return;

    // Clear session on game end
    await clearGameSession(user.uid);

    if (mode === GameMode.ENDLESS) {
      await updateEndlessHighScore(user.uid, score, user.displayName || 'Anonymous');
    } else if (mode === GameMode.LEVEL) {
      await updateLevelProgress(user.uid, level, user.displayName || 'Anonymous');
    }
  };

  const handleDoorClick = async (index: number) => {
    if (status !== 'playing' || isPaused) return;
    
    setSelectedDoor(index);
    if (index === room?.correctDoor) {
      setStatus('success');
      soundManager.play('correct');
      const nextLevel = level + 1;
      const points = mode === GameMode.ENDLESS ? timeLeft * 10 : 100;
      
      setTimeout(async () => {
        setLevel(nextLevel);
        setScore((s) => s + points);
        setStatus('playing');
        setSelectedDoor(null);
        
        // Save progress if in Level mode
        if (mode === GameMode.LEVEL && auth.currentUser) {
          await updateLevelProgress(auth.currentUser.uid, nextLevel, auth.currentUser.displayName || 'Anonymous');
        }

        // Mark as completed if in Daily mode
        if (mode === GameMode.DAILY && auth.currentUser) {
          await updateDailyCompletion(auth.currentUser.uid);
        }
      }, 800);
    } else {
      setStatus('failed');
      soundManager.play('fail');
      await handleGameEnd();
    }
  };

  const restart = async () => {
    const user = auth.currentUser;
    if (user) {
      await clearGameSession(user.uid);
    }
    soundManager.play('click');
    setLevel(1);
    setScore(0);
    setStatus('playing');
    setSelectedDoor(null);
    setRoom(generateRoom(1));
  };

  return (
    <div className="w-full h-full flex flex-col items-center">
      {/* Game Header */}
      <div className="w-full max-w-2xl flex items-center justify-between mb-8">
        <button 
          onClick={onExit}
          className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white"
        >
          <ChevronLeft size={24} />
        </button>

        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Level</p>
            <p className="text-2xl font-black text-emerald-400">{level}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Score</p>
            <p className="text-2xl font-black">{score}</p>
          </div>
          {mode === GameMode.ENDLESS && (
            <div className={`text-center transition-colors ${timeLeft < 3 ? 'text-red-500' : 'text-amber-500'}`}>
              <p className="text-[10px] uppercase tracking-widest font-bold">Time</p>
              <div className="flex items-center gap-1 justify-center">
                <Timer size={14} />
                <p className="text-2xl font-black">{timeLeft}s</p>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={restart}
          className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white"
        >
          <RotateCcw size={20} />
        </button>

        <button 
          onClick={() => {
            soundManager.play('click');
            setIsPaused(!isPaused);
          }}
          className={`p-2 rounded-xl transition-colors ${isPaused ? 'bg-emerald-500 text-white' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}
        >
          {isPaused ? <Play size={20} /> : <Pause size={20} />}
        </button>
      </div>

      {/* Game Area */}
      <motion.div 
        animate={status === 'failed' && settings.animations ? { x: [0, -10, 10, -10, 10, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-4xl aspect-[4/3] md:aspect-[16/9] bg-slate-900/50 rounded-[40px] border border-white/5 overflow-hidden flex flex-col items-center justify-center p-8 lg:p-12"
      >
        
        {/* Environment Decorations */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/4 w-1 h-full bg-white/5" />
          <div className="absolute top-0 right-1/4 w-1 h-full bg-white/5" />
          <div className="absolute bottom-1/4 left-0 w-full h-1 bg-white/5" />
        </div>

        {/* Clue/Hint Lightbulb */}
        <AnimatePresence>
          {room?.hint && status === 'playing' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute top-6 right-8 z-30 group"
            >
              <div className="relative">
                <motion.div 
                  animate={{ 
                    boxShadow: ["0 0 10px rgba(250,204,21,0.2)", "0 0 25px rgba(250,204,21,0.4)", "0 0 10px rgba(250,204,21,0.2)"] 
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="p-3 rounded-full bg-slate-800/80 backdrop-blur-sm border border-amber-500/30 text-amber-400 cursor-help"
                >
                  <Lightbulb size={20} className="fill-amber-400/20" />
                </motion.div>

                {/* Hint Popover */}
                <div className="absolute top-1/2 right-full mr-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                  <div className="bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[180px] max-w-[240px] relative">
                    <p className="text-[10px] text-amber-500 font-black uppercase tracking-widest mb-1">Room Insight</p>
                    <p className="text-sm text-white font-medium italic">"{room.hint}"</p>
                    {/* Arrow */}
                    <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-slate-900 border-r border-t border-white/10 rotate-45" />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Doors Grid */}
        <div className={`z-10 grid gap-4 lg:gap-8 w-full max-w-3xl ${
          room?.doors && room.doors > 4 ? 'grid-cols-3 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
        } ${isPaused ? 'opacity-20 pointer-events-none grayscale' : ''}`}>
          {Array.from({ length: room?.doors || 0 }).map((_, i) => (
            <motion.button
              key={i}
              initial={settings.animations ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={settings.animations ? { delay: i * 0.1 } : { duration: 0 }}
              whileHover={settings.animations ? { scale: 1.05, y: -5 } : {}}
              whileTap={settings.animations ? { scale: 0.95 } : {}}
              onClick={() => handleDoorClick(i)}
              disabled={status !== 'playing'}
              className={`group relative aspect-[2/3] rounded-2xl transition-all ${
                selectedDoor === i 
                  ? (i === room?.correctDoor ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_40_px_rgba(239,68,68,0.4)]') 
                  : 'bg-slate-800 hover:bg-slate-700 border border-white/5 hover:border-emerald-500/30'
              }`}
            >
              {/* Correct Selection Effect */}
              {selectedDoor === i && i === room?.correctDoor && settings.animations && (
                <>
                  <motion.div
                    initial={{ scale: 1, opacity: 0.8 }}
                    animate={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 0.5, repeat: 1 }}
                    className="absolute inset-0 border-4 border-emerald-400 rounded-2xl z-0"
                  />
                  <motion.div
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="absolute inset-0 bg-emerald-400 rounded-2xl z-0"
                  />
                  {/* Particles */}
                  {[...Array(6)].map((_, j) => (
                    <motion.div
                      key={j}
                      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                      animate={{ 
                        x: (Math.random() - 0.5) * 100, 
                        y: (Math.random() - 0.5) * 100, 
                        scale: 0,
                        opacity: 0 
                      }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="absolute left-1/2 top-1/2 w-2 h-2 bg-emerald-400 rounded-full z-10"
                    />
                  ))}
                </>
              )}

              {/* Door Visuals */}
              <div className="absolute inset-2 border-2 border-dashed border-white/5 rounded-xl transition-colors group-hover:border-emerald-500/20" />
              <div className="absolute top-1/2 right-3 w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-emerald-500/40" />
              
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`font-black text-2xl transition-colors ${
                  selectedDoor === i ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'
                }`}>
                  {i + 1}
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* The Rat (Mascot) */}
        <motion.div 
          animate={{ 
            x: selectedDoor !== null ? (selectedDoor % 4) * 80 - 120 : 0, 
            y: status === 'success' ? [100, -140, 100] : (status === 'failed' ? [100, 60, 100] : (selectedDoor !== null ? -40 : 100)),
            rotate: status === 'success' ? [0, 720] : (status === 'failed' ? [0, -20, 20, -20, 0] : (selectedDoor !== null ? (selectedDoor % 4 > 1 ? 5 : -5) : 0)),
            scaleX: status === 'success' ? [1, 0.8, 1.2, 1] : (status === 'failed' ? [1, 1.3, 0.9, 1] : 1),
            scaleY: status === 'success' ? [1, 1.4, 0.8, 1] : (status === 'failed' ? [1, 0.7, 1.1, 1] : 1),
          }}
          transition={settings.animations ? { 
            type: 'spring', 
            damping: 15,
            stiffness: 120,
            y: { duration: 0.5, ease: "backOut" },
            rotate: { duration: 0.6 },
            scaleX: { duration: 0.3 },
            scaleY: { duration: 0.3 }
          } : { duration: 0 }}
          className="absolute bottom-12 z-20 pointer-events-auto cursor-help"
        >
          {/* Reaction Bubble */}
          <AnimatePresence mode="wait">
            {(selectedDoor !== null || status !== 'playing') && (
              <motion.div
                key={status}
                initial={{ opacity: 0, scale: 0, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-2 py-1 rounded-full text-sm font-black shadow-lg"
              >
                {status === 'success' ? '🎉' : status === 'failed' ? '😱' : '?!'}
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            whileHover={settings.animations ? { 
              rotate: [0, -7, 7, -5, 5, 0],
              x: [0, -2, 2, -1, 1, 0],
              y: [0, -1, 1, -1, 0],
              scale: [1, 1.1, 1.05, 1.1, 1],
              transition: { 
                duration: 0.3, 
                repeat: Infinity,
                repeatDelay: 0.05
              }
            } : {}}
            className="w-16 h-16 bg-slate-700/80 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-visible"
          >
            <motion.span
              animate={status === 'failed' ? { rotate: [0, 180, 0], scale: [1, 0.8, 1] } : { rotate: 0, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              🐀
            </motion.span>
            
            {/* Ambient Glow */}
            <motion.div 
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: status === 'playing' ? [0.1, 0.3, 0.1] : 0.5 
              }}
              transition={{ repeat: Infinity, duration: 2 }}
              className={`absolute inset-0 rounded-full blur-xl ${status === 'success' ? 'bg-emerald-400' : status === 'failed' ? 'bg-red-400' : 'bg-white'}`}
            />
          </motion.div>
        </motion.div>

        {/* Fail Overlay */}
        <AnimatePresence>
          {status === 'failed' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-50 bg-slate-950/90 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle size={40} className="text-red-500" />
              </div>
              <h2 className="text-4xl font-black mb-2 italic">LOOP RESET!</h2>
              <p className="text-slate-400 mb-8 max-w-sm">The trap was triggered. A wrong door led you back to the start of the loop.</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={restart}
                  className="px-8 py-3 bg-white text-slate-950 rounded-2xl font-bold hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/10"
                >
                  Try Again
                </button>
                <button 
                  onClick={onExit}
                  className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-colors"
                >
                  Quit
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Feedback */}
        <AnimatePresence>
          {status === 'success' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute z-40 pointer-events-none"
            >
              <div className="px-6 py-3 rounded-full bg-emerald-500 text-white font-black italic text-xl shadow-[0_0_40px_rgba(16,185,129,0.5)]">
                ESCAPE SUCCESS!
              </div>
            </motion.div>
          )}
          {status === 'failed' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute z-40 pointer-events-none"
            >
              <div className="px-6 py-3 rounded-full bg-red-500 text-white font-black italic text-xl shadow-[0_0_40px_rgba(239,68,68,0.5)]">
                WRONG DOOR!
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Success Flash Overlay */}
        <AnimatePresence>
          {status === 'success' && settings.animations && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0] }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 z-30 bg-emerald-400 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Pause Overlay */}
        <AnimatePresence>
          {isPaused && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
                  <Pause size={40} className="text-emerald-500" />
                </div>
                <h2 className="text-4xl font-black mb-2 italic">GAME PAUSED</h2>
                <p className="text-slate-400 mb-8 max-w-sm">The loop is temporarily frozen. Take a breath, then continue your escape.</p>
                
                <button 
                  onClick={() => {
                    soundManager.play('click');
                    setIsPaused(false);
                  }}
                  className="px-8 py-3 bg-white text-slate-950 rounded-2xl font-bold hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/20 flex items-center gap-2"
                >
                  <Play size={20} />
                  <span>Resume Escape</span>
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Clues Footer */}
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        {[
          { label: 'Deaths', value: '4' },
          { label: 'Longest Run', value: 'Level 24' },
          { label: 'World Peak', value: 'Level 82' }
        ].map((stat, i) => (
          <div key={i} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-center min-w-[100px]">
            <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none mb-1">{stat.label}</p>
            <p className="text-sm font-bold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
