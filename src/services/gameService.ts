/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, handleFirestoreError, OperationType, auth } from '../lib/firebase.ts';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { UserProfile, LeaderboardEntry, GameSettings, GameSession, GameMode } from '../types.ts';

export const getTopScores = async (category: 'endless' | 'levels'): Promise<LeaderboardEntry[]> => {
  try {
    const colRef = collection(db, 'leaderboards', category, 'scores');
    const q = query(colRef, orderBy('score', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as LeaderboardEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `leaderboards/${category}/scores`);
    return [];
  }
};

export const getUserProgress = async (userId: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    return null;
  }
};

export const initUserProfile = async (userId: string, displayName: string, photoURL: string) => {
  try {
    const profile: Partial<UserProfile> = {
      uid: userId,
      displayName,
      photoURL,
      levelProgress: 1,
      endlessHighScore: 0,
      dailyCompleted: [],
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await setDoc(doc(db, 'users', userId), profile);
    return profile as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
};

export const updateLevelProgress = async (userId: string, level: number, displayName: string) => {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    const currentProgress = snap.exists() ? (snap.data().levelProgress || 1) : 1;

    if (level > currentProgress) {
      if (level === currentProgress + 1) {
        await updateDoc(docRef, {
          levelProgress: level,
          updatedAt: serverTimestamp(),
        });
        
        // Also update leaderboard for level
        const scoreId = `level_${userId}`;
        await setDoc(doc(db, 'leaderboards/levels/scores', scoreId), {
          uid: userId,
          displayName,
          score: level,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const updateEndlessHighScore = async (userId: string, score: number, displayName: string) => {
  try {
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    const currentHigh = snap.exists() ? snap.data().endlessHighScore : 0;
    
    if (score > currentHigh) {
      await updateDoc(docRef, {
        endlessHighScore: score,
        updatedAt: serverTimestamp(),
      });
      
      // Update global leaderboard
      const scoreId = `endless_${userId}`;
      await setDoc(doc(db, 'leaderboards/endless/scores', scoreId), {
        uid: userId,
        score: score,
        displayName,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const updateSettings = async (userId: string, settings: GameSettings) => {
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      settings,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const updateDailyCompletion = async (userId: string) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, 'users', userId);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      const data = snap.data();
      const completed = data.dailyCompleted || [];
      if (!completed.includes(today)) {
        await updateDoc(docRef, {
          dailyCompleted: [...completed, today],
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const saveGameSession = async (userId: string, session: Omit<GameSession, 'updatedAt'>) => {
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      currentSession: {
        ...session,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const clearGameSession = async (userId: string) => {
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      currentSession: null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};

export const resetProgress = async (userId: string) => {
  try {
    const docRef = doc(db, 'users', userId);
    await updateDoc(docRef, {
      levelProgress: 1,
      endlessHighScore: 0,
      dailyCompleted: [],
      currentSession: null,
      updatedAt: serverTimestamp(),
    });

    // Also reset leaderboard entries
    const displayName = auth.currentUser?.displayName || 'Anonymous';
    await setDoc(doc(db, 'leaderboards/levels/scores', `level_${userId}`), {
      uid: userId,
      displayName,
      score: 1,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, 'leaderboards/endless/scores', `endless_${userId}`), {
      uid: userId,
      score: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });

  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
};
