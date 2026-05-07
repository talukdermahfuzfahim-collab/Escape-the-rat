/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundManager {
  private volume: number = 0.5;
  private sounds: Record<string, HTMLAudioElement> = {};
  private bgMusic: HTMLAudioElement | null = null;
  private isMusicPlaying: boolean = false;

  constructor() {
    this.sounds = {
      click: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
      success: new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'),
      fail: new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'),
      complete: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
      toggle: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
      correct: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'),
    };

    // Background Music - loopable track
    this.bgMusic = new Audio('https://assets.mixkit.co/active_storage/sfx/123/123-preview.mp3');
    this.bgMusic.loop = true;

    // Preload
    Object.values(this.sounds).forEach(s => s.load());
    this.bgMusic.load();
  }

  setVolume(v: number) {
    this.volume = v;
    Object.values(this.sounds).forEach(s => {
      s.volume = v;
    });
    if (this.bgMusic) {
      this.bgMusic.volume = v * 0.4; // Lower volume for background
    }
  }

  play(name: 'click' | 'success' | 'fail' | 'complete' | 'toggle' | 'correct') {
    const sound = this.sounds[name];
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(e => console.warn('Audio playback blocked until user interaction', e));
    }
  }

  startMusic() {
    if (this.bgMusic && !this.isMusicPlaying) {
      this.bgMusic.play()
        .then(() => {
          this.isMusicPlaying = true;
        })
        .catch(e => console.warn('Background music blocked until user interaction', e));
    }
  }

  stopMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.isMusicPlaying = false;
    }
  }
}

export const soundManager = new SoundManager();
