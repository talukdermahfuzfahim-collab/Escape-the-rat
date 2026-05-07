/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GameSettings {
  volume: number;
  animations: boolean;
  musicEnabled: boolean;
}

export interface GameSession {
  mode: GameMode;
  level: number;
  score: number;
  timeLeft: number;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  levelProgress: number;
  endlessHighScore: number;
  dailyCompleted: string[];
  settings?: GameSettings;
  currentSession?: GameSession | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  score: number;
  level?: number;
  updatedAt: string;
}

export enum GameMode {
  LEVEL = 'level',
  DAILY = 'daily',
  ENDLESS = 'endless',
}

export interface RoomConfig {
  id: number;
  doors: number;
  correctDoor: number;
  hint?: string;
  trapType?: 'poison' | 'reset' | 'penalty' | 'none';
}
