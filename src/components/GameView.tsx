/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GameMode, RoomConfig, GameSettings } from '../types.ts';
import { ChevronLeft, RotateCcw, AlertTriangle, ShieldCheck, Timer, Pause, Play, Lightbulb, X } from 'lucide-react';
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
  const [focusedDoor, setFocusedDoor] = useState<number>(0);
  const [isPoisoned, setIsPoisoned] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('tutorial_seen');
    }
    return false;
  });

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice(('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    };
    checkTouch();
  }, []);
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

    const scalingFactor = mode === GameMode.ENDLESS ? 3 : 5;
    const maxDoors = mode === GameMode.ENDLESS ? 15 : 10;
    const doorCount = Math.min(maxDoors, 2 + Math.floor(currentLevel / scalingFactor));
    const correctDoor = Math.floor(pseudoRandom() * doorCount);
    const doorNum = correctDoor + 1;
    
    // Determine Trap Type
    let trapType: RoomConfig['trapType'] = 'none';
    if (currentLevel > 2) {
      const trapRoll = pseudoRandom();
      if (currentLevel > 15) {
        if (trapRoll < 0.3) trapType = 'poison';
        else if (trapRoll < 0.6) trapType = 'penalty';
        else trapType = 'reset';
      } else if (currentLevel > 8) {
        if (trapRoll < 0.4) trapType = 'penalty';
        else trapType = 'reset';
      } else {
        trapType = 'reset';
      }
    }

    // Generate contextually relevant hints
    let hint = '';
    if (currentLevel > 1) {
      const possibleHints: string[] = [];
      const isEven = doorNum % 2 === 0;
      
      // Basic Directional Hints
      if (correctDoor < doorCount / 2) possibleHints.push('Look to the left');
      else possibleHints.push('Look to the right');

      // Parity Hints
      possibleHints.push(isEven ? 'The path is even' : 'The path is odd');

      // Trap-Specific Warning Hints (Contextual)
      if (trapType === 'poison') {
        possibleHints.push('The air feels heavy...');
        possibleHints.push('Breath slowly and choose');
      } else if (trapType === 'penalty') {
        possibleHints.push('A hefty price awaits errors');
        possibleHints.push('High stakes in this hall');
      } else if (trapType === 'reset') {
        possibleHints.push('A long fall back to start');
      }

      // Intermediate Hints (Level 12+)
      if (currentLevel >= 12) {
        if (doorNum === 2 || doorNum === 3 || doorNum === 5 || doorNum === 7 || doorNum === 11 || doorNum === 13) {
          possibleHints.push('Follow the prime numbers');
        }
        if (doorNum % 3 === 0) possibleHints.push('It is a multiple of 3');
        if (correctDoor > 0 && correctDoor < doorCount - 1) possibleHints.push('The edges are dangerous');
        const middle = Math.floor(doorCount / 2);
        if (correctDoor === middle) possibleHints.push('Trust the center');
      }

      // Advanced Hints (Level 25+)
      if (currentLevel >= 25) {
        if (correctDoor === 0) possibleHints.push('The first shall be first');
        if (correctDoor === doorCount - 1) possibleHints.push('The end is the beginning');
        const isPerfectSquare = (n: number) => Math.sqrt(n) % 1 === 0;
        if (isPerfectSquare(doorNum)) possibleHints.push('Perfect geometry leads the way');
        if (doorNum > 5) possibleHints.push('Ascend higher');
        else possibleHints.push('Lower foundations');
        
        // Obscure Hints (High level flavor)
        if (isEven && doorNum > doorCount / 2) possibleHints.push('High and balanced');
        if (!isEven && doorNum <= doorCount / 2) possibleHints.push('Low and uneven');
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
      trapType
    };
  }, [mode]);

  useEffect(() => {
    setRoom(generateRoom(level));
    // Only reset time if it's a new level and we're NOT resuming (initialTimeLeft check)
    // Actually, always reset time on level up in endless mode
    if (mode === GameMode.ENDLESS && status === 'playing' && initialTimeLeft === undefined) {
      const baseTime = 11;
      const reduction = Math.floor(level / 4);
      setTimeLeft(Math.max(2, baseTime - reduction));
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
      if (showTutorial) return;

      const key = e.key.toLowerCase();
      
      if (key === 'p' && status === 'playing') {
        setIsPaused((prev) => !prev);
        soundManager.play('click');
        return;
      }

      if (isPaused || status !== 'playing') return;

      const doorCount = room?.doors || 0;
      const cols = doorCount > 4 ? 3 : 4;

      if (key === 'a' || e.key === 'ArrowLeft') {
        setFocusedDoor(f => Math.max(0, f - 1));
      } else if (key === 'd' || e.key === 'ArrowRight') {
        setFocusedDoor(f => Math.min(doorCount - 1, f + 1));
      } else if (key === 'w' || e.key === 'ArrowUp') {
        setFocusedDoor(f => Math.max(0, f - cols));
      } else if (key === 's' || e.key === 'ArrowDown') {
        setFocusedDoor(f => Math.min(doorCount - 1, f + cols));
      } else if (e.key === ' ' || e.key === 'Enter') {
        handleDoorClick(focusedDoor);
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const idx = parseInt(e.key) - 1;
        if (idx < doorCount) {
          setFocusedDoor(idx);
          handleDoorClick(idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, isPaused, room, focusedDoor, showTutorial]);

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
    if (status !== 'playing' || isPaused || showTutorial) return;
    
    setFocusedDoor(index);
    setSelectedDoor(index);
    if (index === room?.correctDoor) {
      setStatus('success');
      soundManager.play('correct');
      const nextLevel = level + 1;
      const points = mode === GameMode.ENDLESS ? timeLeft * 10 : 100;
      
      setTimeout(async () => {
        setIsLoadingRoom(true);
        
        // Brief artificial delay for "generation"
        setTimeout(async () => {
          setLevel(nextLevel);
          setScore((s) => s + points);
          setStatus('playing');
          setIsLoadingRoom(false);
          setSelectedDoor(null);
          
          // Clear poison if was active
          if (isPoisoned) setIsPoisoned(false);

          // Save progress if in Level mode
          if (mode === GameMode.LEVEL && auth.currentUser) {
            await updateLevelProgress(auth.currentUser.uid, nextLevel, auth.currentUser.displayName || 'Anonymous');
          }

          // Mark as completed if in Daily mode
          if (mode === GameMode.DAILY && auth.currentUser) {
            await updateDailyCompletion(auth.currentUser.uid);
          }
        }, 400);
      }, 600);
    } else {
      soundManager.play('fail');
      
      // Handle Trap
      if (room?.trapType === 'poison') {
        setIsPoisoned(true);
        setStatus('failed');
      } else if (room?.trapType === 'penalty') {
        setScore(s => Math.max(0, s - (mode === GameMode.ENDLESS ? 50 : 200)));
        if (mode === GameMode.ENDLESS) {
          setTimeLeft(t => Math.max(0, t - 5));
        }
        setStatus('failed');
      } else {
        setStatus('failed');
      }

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
    setIsPoisoned(false);
    setRoom(generateRoom(1));
  };

  // Rat Mascot Animation Variants
  const ratVariants = {
    playing: (custom: { col: number, cols: number }) => ({
      opacity: 1,
      scale: 1,
      x: custom.col * 80 - (custom.cols === 3 ? 80 : 120),
      y: -40,
      rotate: custom.col > custom.cols / 2 ? 5 : -5,
      transition: {
        type: 'spring',
        damping: 15,
        stiffness: 120,
        staggerChildren: 0.05
      }
    }),
    success: {
      opacity: 1,
      scale: 1,
      y: [100, -140, 100],
      rotate: [0, 720],
      scaleX: [1, 0.8, 1.2, 1],
      scaleY: [1, 1.4, 0.8, 1],
      transition: {
        y: { duration: 0.6, ease: "backOut" },
        rotate: { duration: 0.8, ease: "easeInOut" },
        scaleX: { duration: 0.4 },
        scaleY: { duration: 0.4 },
        staggerChildren: 0.1
      }
    },
    failed: {
      opacity: 1,
      scale: 1,
      y: [100, 60, 100],
      rotate: [0, -20, 25, -25, 20, 0],
      scaleX: [1, 1.3, 0.9, 1],
      scaleY: [1, 0.7, 1.1, 1],
      transition: {
        y: { duration: 0.5, ease: "circOut" },
        rotate: { duration: 0.5 },
        scaleX: { duration: 0.3 },
        scaleY: { duration: 0.3 },
        staggerChildren: 0.05
      }
    }
  };

  const ratInnerVariants = {
    playing: { rotate: 0, scale: 1 },
    success: { 
      scale: [1, 1.4, 1],
      transition: { duration: 0.5, ease: "backOut" } 
    },
    failed: { 
      rotate: [0, 180, 360, 0], 
      scale: [1, 0.7, 1.2, 1],
      transition: { duration: 0.8 } 
    }
  };

  const glowVariants = {
    playing: { 
      scale: [1, 1.4, 1],
      opacity: [0.1, 0.3, 0.1],
      backgroundColor: "rgb(255, 255, 255)",
      transition: { repeat: Infinity, duration: 2 } 
    },
    success: { 
      scale: [1, 2.5, 1],
      opacity: [0.5, 0.8, 0.4],
      backgroundColor: "rgb(52, 211, 153)",
      transition: { duration: 0.5 }
    },
    failed: { 
      scale: [1, 2, 1],
      opacity: [0.5, 0.2, 0.5],
      backgroundColor: "rgb(248, 113, 113)",
      transition: { duration: 0.5 }
    }
  };

  const cols = room?.doors ? (room.doors > 6 ? 5 : (room.doors > 4 ? 3 : 4)) : 4;
  const col = focusedDoor % cols;
  const row = Math.floor(focusedDoor / cols);

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
        
        {/* Tutorial Overlay */}
        <AnimatePresence>
          {showTutorial && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-slate-900 border border-white/10 rounded-[32px] p-6 shadow-2xl max-w-sm w-full relative overflow-hidden"
              >
                <button 
                  onClick={() => {
                    soundManager.play('click');
                    setShowTutorial(false);
                    localStorage.setItem('tutorial_seen', 'true');
                  }}
                  className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>

                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                    <span className="text-2xl animate-bounce">🐀</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-black italic">CONTROL GUIDE</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Initial Training</p>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  {isTouchDevice ? (
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-xs text-slate-300">Tap doors to explore</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                        <p className="text-xs text-slate-300">Move Selection</p>
                        <div className="flex gap-1">
                          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold">W</kbd>
                          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold">A</kbd>
                          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold">S</kbd>
                          <kbd className="px-1.5 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold">D</kbd>
                        </div>
                      </div>
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                        <p className="text-xs text-slate-300">Open Door</p>
                        <kbd className="px-3 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold uppercase">Space</kbd>
                      </div>
                    </>
                  )}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between">
                    <p className="text-xs text-slate-300">Pause Loop</p>
                    <kbd className="px-2 py-0.5 bg-slate-800 border border-white/20 rounded text-[9px] font-bold">P</kbd>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    soundManager.play('click');
                    setShowTutorial(false);
                    localStorage.setItem('tutorial_seen', 'true');
                  }}
                  className="w-full py-4 bg-emerald-500 text-emerald-950 font-black rounded-2xl shadow-xl shadow-emerald-500/20 hover:bg-emerald-400 transition-colors uppercase tracking-widest"
                >
                  Understood
                </button>
              </motion.div>
            </motion.div>
          )}

          {isLoadingRoom && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  </div>
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 animate-pulse">
                  Generating Room...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        <div className={`z-10 grid gap-3 sm:gap-4 lg:gap-8 w-full max-w-3xl ${
          room?.doors && room.doors > 6
            ? 'grid-cols-5'
            : (room?.doors && room.doors > 4 
                ? 'grid-cols-3 sm:grid-cols-3' 
                : (room?.doors && room.doors > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-2'))
        } ${status !== 'playing' || isPaused || isLoadingRoom ? 'opacity-30 pointer-events-none grayscale-[0.5]' : ''}`}>
          {Array.from({ length: room?.doors || 0 }).map((_, i) => (
            <motion.button
              key={i}
              initial={settings.animations ? { scale: 0.9, opacity: 0 } : { scale: 1, opacity: 1 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={settings.animations ? { delay: i * 0.1 } : { duration: 0 }}
              whileHover={settings.animations ? { scale: 1.05, y: -5 } : {}}
              whileTap={settings.animations ? { scale: 0.95 } : {}}
              onClick={() => handleDoorClick(i)}
              onMouseEnter={() => !showTutorial && setFocusedDoor(i)}
              disabled={status !== 'playing'}
              className={`group relative aspect-[2/3] rounded-2xl transition-all ${
                selectedDoor === i 
                  ? (i === room?.correctDoor ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_40_px_rgba(239,68,68,0.4)]') 
                  : (focusedDoor === i && !isPaused ? 'bg-slate-700 ring-2 ring-emerald-500/50' : 'bg-slate-800 border border-white/5 hover:bg-slate-700 hover:border-emerald-500/30')
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
        <AnimatePresence>
          {!isLoadingRoom && (
            <motion.div 
              variants={ratVariants}
              custom={{ col, cols }}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={status}
              exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
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
              whileHover={settings.animations && !isTouchDevice ? { 
                rotate: [0, -12, 12, -8, 8, -4, 4, 0],
                x: [0, -3, 3, -2, 2, -1, 1, 0],
                y: [0, -2, 2, -1, 1, 0],
                scale: [1, 1.15, 1.08, 1.12, 1.05, 1],
                transition: { 
                  duration: 0.25, 
                  repeat: Infinity,
                  repeatDelay: 0.1,
                  ease: "easeInOut"
                }
              } : {}}
              whileTap={settings.animations ? { 
                scale: 0.9, 
                rotate: 0,
                y: 5
              } : {}}
              className="w-16 h-16 bg-slate-700/80 backdrop-blur-sm rounded-full flex items-center justify-center text-3xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-visible"
            >
              <motion.span
                variants={ratInnerVariants}
              >
                🐀
              </motion.span>
              
              {/* Ambient Glow */}
              <motion.div 
                variants={glowVariants}
                className="absolute inset-0 rounded-full blur-xl"
              />
            </motion.div>
          </motion.div>
          )}
        </AnimatePresence>

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
              <h2 className="text-4xl font-black mb-2 italic">
                {room?.trapType === 'poison' ? 'CHOKING GAS!' : room?.trapType === 'penalty' ? 'HEAVY TOLL!' : 'LOOP RESET!'}
              </h2>
              <p className="text-slate-400 mb-8 max-w-sm">
                {room?.trapType === 'poison' 
                  ? 'A toxic trap was triggered. Your vision will be obscured in the next attempt.' 
                  : room?.trapType === 'penalty' 
                    ? 'The trap sapped your resources! You have lost considerable score.' 
                    : 'A wrong door led you back to the start of the loop.'}
              </p>
              
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

        {/* Poison Effect Overlay */}
        <AnimatePresence>
          {isPoisoned && !isLoadingRoom && status === 'playing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[70] pointer-events-none"
            >
              <div className="absolute inset-0 bg-emerald-950/40 mix-blend-multiply" />
              <div className="absolute inset-0 shadow-[inset_0_0_150px_rgba(16,185,129,0.5)]" />
              <motion.div 
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute inset-[-10%] bg-[radial-gradient(circle,transparent_40%,rgba(6,78,59,0.8)_80%)]"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Feedback */}
        <AnimatePresence>
          {level > 20 && status === 'playing' && settings.animations && (
            <motion.div 
              animate={{ 
                opacity: [0, 0.15, 0, 0.1, 0],
                x: [0, -2, 2, -1, 0]
              }}
              transition={{ repeat: Infinity, duration: 8, times: [0, 0.05, 0.1, 0.15, 1] }}
              className="absolute inset-0 bg-white z-[5] pointer-events-none"
            />
          )}
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
      <div className="mt-8 flex flex-col items-center gap-6">
        {/* Quick Controls Hint */}
        <div className="flex items-center gap-4 px-6 py-2 rounded-full bg-white/5 border border-white/5 text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]">
          {isTouchDevice ? (
            <span className="flex items-center gap-2">Tap any door to select</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-white/10 text-white">WASD</kbd> Move</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-white/10 text-white">SPACE</kbd> Select</span>
              <span className="w-1 h-1 rounded-full bg-white/10" />
              <span className="flex items-center gap-1.5"><kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-white/10 text-white">P</kbd> Pause</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-4">
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
    </div>
  );
}
