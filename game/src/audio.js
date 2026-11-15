// Procedural sound: every effect is synthesized with Web Audio, so the game ships no
// audio files and makes no network request. A short noise buffer is shared by every
// percussive sound; tones are oscillators. All of it is silent until the player first
// interacts (the browser's autoplay rule), and a master gain caps the mix.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let enabled = true;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(when, duration, filterFreq, filterType, gainValue, decay = 0.001) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(decay, when + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(when, Math.random() * 0.4, duration + 0.05);
    source.stop(when + duration + 0.05);
  }

  function tone(when, duration, freqFrom, freqTo, type, gainValue) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, when);
    if (freqTo !== freqFrom) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), when + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function play(fn) {
    if (!enabled || !ensure()) return;
    try {
      fn(context.currentTime);
    } catch {
      // A sound that fails to schedule must never break the game loop.
    }
  }

  return {
    unlock() {
      ensure();
    },
    setEnabled(value) {
      enabled = value;
    },
    shot(kind) {
      play((t) => {
        if (kind === 'rifle') {
          noise(t, 0.14, 1800, 'lowpass', 0.9);
          tone(t, 0.09, 160, 60, 'square', 0.35);
        } else if (kind === 'smg') {
          noise(t, 0.09, 2400, 'bandpass', 0.7);
          tone(t, 0.06, 220, 90, 'square', 0.25);
        } else if (kind === 'dmr') {
          noise(t, 0.22, 1200, 'lowpass', 1.0);
          tone(t, 0.16, 120, 40, 'square', 0.5);
        } else {
          noise(t, 0.1, 2000, 'bandpass', 0.6);
          tone(t, 0.07, 200, 80, 'square', 0.3);
        }
      });
    },
    dryFire() {
      play((t) => tone(t, 0.04, 1200, 900, 'square', 0.15));
    },
    reload() {
      play((t) => {
        tone(t, 0.05, 700, 500, 'square', 0.2);
        tone(t + 0.28, 0.05, 900, 600, 'square', 0.2);
        tone(t + 0.62, 0.06, 1100, 800, 'square', 0.25);
      });
    },
    hit(head) {
      play((t) => tone(t, 0.07, head ? 1560 : 1180, head ? 1560 : 1180, 'sine', 0.3));
    },
    kill() {
      play((t) => {
        tone(t, 0.08, 880, 880, 'sine', 0.3);
        tone(t + 0.09, 0.12, 1318, 1318, 'sine', 0.3);
      });
    },
    hurt() {
      play((t) => {
        noise(t, 0.12, 500, 'lowpass', 0.5);
        tone(t, 0.12, 90, 55, 'sine', 0.4);
      });
    },
    step() {
      play((t) => noise(t, 0.05, 400, 'lowpass', 0.08));
    },
    plantBeep(final) {
      play((t) => tone(t, final ? 0.3 : 0.09, final ? 1560 : 1040, final ? 1560 : 1040, 'sine', 0.3));
    },
    defuseBeep() {
      play((t) => tone(t, 0.09, 880, 880, 'sine', 0.25));
    },
    explosion() {
      play((t) => {
        noise(t, 1.1, 300, 'lowpass', 1.0);
        tone(t, 0.9, 120, 28, 'sine', 0.9);
        noise(t + 0.05, 0.3, 3000, 'highpass', 0.3);
      });
    },
    roundEnd(won) {
      play((t) => {
        const notes = won ? [523, 659, 784] : [392, 330, 262];
        notes.forEach((freq, i) => tone(t + i * 0.14, 0.22, freq, freq, 'triangle', 0.3));
      });
    },
    buy() {
      play((t) => {
        tone(t, 0.1, 988, 988, 'sine', 0.25);
        tone(t + 0.08, 0.14, 1318, 1318, 'sine', 0.25);
      });
    },
    denied() {
      play((t) => tone(t, 0.12, 180, 140, 'square', 0.2));
    },
    flash() {
      play((t) => {
        noise(t, 0.4, 6000, 'highpass', 0.5);
        tone(t, 0.3, 2400, 1200, 'sine', 0.15);
      });
    },
  };
}
