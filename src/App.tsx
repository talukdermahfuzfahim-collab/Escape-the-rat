/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { auth, signIn, logOut } from './lib/firebase.ts';
import { onAuthStateChanged, User } from 'firebase/auth';
import { GameMode, UserProfile, GameSettings } from './types.ts';
import { getUserProgress, initUserProfile, updateSettings, resetProgress } from './services/gameService.ts';
import { soundManager } from './lib/sounds.ts';
import MainMenu from './components/MainMenu.tsx';
import GameView from './components/GameView.tsx';
import SettingsMenu from './components/SettingsMenu.tsx';
import { LogIn, LogOut, User as UserIcon, Settings, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.5,
  animations: true,
  musicEnabled: true,
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<GameMode | null>(null);
  const [selectedStartLevel, setSelectedStartLevel] = useState<number>(1);
  const [sessionScore, setSessionScore] = useState<number>(0);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    soundManager.setVolume(settings.volume);
    if (settings.musicEnabled && settings.volume > 0) {
      soundManager.startMusic();
    } else {
      soundManager.stopMusic();
    }
  }, [settings.volume, settings.musicEnabled]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const p = await getUserProgress(u.uid);
        if (!p) {
          const newP = await initUserProfile(u.uid, u.displayName || 'Player', u.photoURL || '');
          if (newP) {
            setProfile(newP);
            const s = newP.settings || DEFAULT_SETTINGS;
            setSettings(s);
            soundManager.setVolume(s.volume);
          }
        } else {
          setProfile(p);
          const s = p.settings || DEFAULT_SETTINGS;
          setSettings(s);
          soundManager.setVolume(s.volume);
        }
      } else {
        setProfile(null);
        setSettings(DEFAULT_SETTINGS);
        soundManager.setVolume(DEFAULT_SETTINGS.volume);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateSettings = async (newSettings: GameSettings) => {
    setSettings(newSettings);
    soundManager.setVolume(newSettings.volume);
    if (user) {
      await updateSettings(user.uid, newSettings);
    }
  };

  const handleResetProgress = async () => {
    if (user) {
      soundManager.play('click');
      await resetProgress(user.uid);
      const updatedProfile = await getUserProgress(user.uid);
      setProfile(updatedProfile);
      setShowSettings(false);
      setCurrentMode(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 overflow-hidden relative">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-emerald-900/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-900/20 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="relative z-50 p-4 lg:p-6 flex items-center justify-between backdrop-blur-sm border-b border-white/5">
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => {
            soundManager.play('click');
            setCurrentMode(null);
          }}
        >
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
            <span className="font-bold text-xl text-emerald-950">🐀</span>
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight leading-none">ESCAPE LOOP</h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase mt-0.5">Puzzle Rooms</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <button 
              onClick={() => {
                soundManager.play('click');
                setShowSettings(true);
              }}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <Settings size={20} />
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-semibold">{user.displayName || 'Player'}</p>
                <p className="text-[10px] text-slate-400">Room {profile?.levelProgress || 1}</p>
              </div>
              <button 
                onClick={() => {
                  soundManager.play('click');
                  logOut();
                }}
                className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <LogOut size={20} />
              </button>
              <img 
                src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                alt="Profile" 
                className="w-10 h-10 rounded-xl border border-white/10"
              />
            </div>
          ) : (
            <button 
              onClick={() => {
                soundManager.play('click');
                signIn();
              }}
              className="flex items-center gap-2 bg-white text-slate-950 px-4 py-2 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/10"
            >
              <LogIn size={18} />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto p-4 lg:p-8 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {!currentMode ? (
            <MainMenu 
              key="menu" 
              profile={profile}
              onSelectMode={(mode, level, score, timeLeft) => {
                soundManager.play('click');
                if (level) setSelectedStartLevel(level);
                if (score !== undefined) setSessionScore(score);
                if (timeLeft !== undefined) setSessionTimeLeft(timeLeft);
                setCurrentMode(mode);
              }} 
            />
          ) : (
            <GameView 
              key="game" 
              mode={currentMode} 
              settings={settings}
              initialLevel={selectedStartLevel}
              initialScore={sessionScore}
              initialTimeLeft={sessionTimeLeft}
              onExit={async () => {
                soundManager.play('click');
                setCurrentMode(null);
                setSelectedStartLevel(1);
                setSessionScore(0);
                setSessionTimeLeft(undefined);
                // Refresh profile to reflect cleared session if game ended
                if (user) {
                  const p = await getUserProgress(user.uid);
                  setProfile(p);
                }
              }} 
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && (
            <SettingsMenu 
              settings={settings}
              onUpdate={handleUpdateSettings}
              onReset={handleResetProgress}
              onClose={() => {
                soundManager.play('click');
                setShowSettings(false);
              }}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Orientation Warning */}
      <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-8 text-center pointer-events-none opacity-0 lg:hidden">
        {/* Only shown via CSS media query if needed, but modern CSS handles orientation well */}
      </div>
    </div>
  );
}
