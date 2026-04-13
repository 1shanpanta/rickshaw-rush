import { MUSIC } from './constants.js';

export class MusicSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.playing = false;

    this.engineOsc = null;
    this.engineGain = null;
    this.engineSub = null;
    this.engineSubGain = null;

    this.droneOsc = null;
    this.droneGain = null;
    this.dronePa = null;

    this.nextBeat = 0;
    this.beatIndex = 0;
    this.melodyIndex = 0;
    this.fluteIndex = 0;
    this.barIndex = 0;
    this.intensity = 0.5;
    this.schedulerInterval = null;
    this.comboMultiplier = 1;
    this.muted = false;
  }

  // Auto-disconnect oscillator and gain when done playing
  _autoClean(osc, ...gains) {
    osc.onended = () => {
      osc.disconnect();
      for (const g of gains) g.disconnect();
    };
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.ctx.destination);

    // Reverb (simple convolver approximation with delay)
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.15;
    const delay = this.ctx.createDelay(0.5);
    delay.delayTime.value = 0.12;
    const fbGain = this.ctx.createGain();
    fbGain.gain.value = 0.3;
    this.reverbGain.connect(delay);
    delay.connect(fbGain);
    fbGain.connect(delay);
    delay.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);

    // Preload audio samples (CC0 from OpenGameArt + originals)
    this.samples = {};
    this.loadSample('horn', '/sounds/horn.mp3');
    this.loadSample('ambiance', '/sounds/ambiance.mp3');
    this.loadSample('crash', '/sounds/crash.mp3');
    this.loadSample('collision', '/sounds/collision.ogg');
    this.loadSample('metal-crash', '/sounds/metal-crash.ogg');
    this.loadSample('nearmiss', '/sounds/nearmiss.wav');
    this.loadSample('bell', '/sounds/bell.ogg');
    this.loadSample('splash', '/sounds/splash.ogg');
    this.loadSample('boost', '/sounds/boost.ogg');
    this.loadSample('siren', '/sounds/siren.mp3');
    this.loadSample('gong', '/sounds/gong.ogg');
    this.loadSample('explosion', '/sounds/explosion.ogg');
    this.loadSample('racing-music', '/sounds/racing-music.ogg');

    this.startEngine();
    this.startMusicTrack();
    this.playing = true;
    this.startAmbient();
  }

  async loadSample(name, url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.samples[name] = await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      // Sample not available, fall back to synthesis
    }
  }

  playSample(name, volume = 1, loop = false) {
    if (!this.ctx || !this.samples[name]) return null;
    const source = this.ctx.createBufferSource();
    source.buffer = this.samples[name];
    source.loop = loop;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    source.connect(g);
    g.connect(this.masterGain);
    source.start();
    return { source, gain: g };
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  // --- Engine ---
  startEngine() {
    const ctx = this.ctx;

    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 180;
    lpf.Q.value = 2;

    this.engineOsc.connect(lpf);
    lpf.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);
    this.engineOsc.start();

    this.engineSub = ctx.createOscillator();
    this.engineSub.type = 'sine';
    this.engineSub.frequency.value = 40;
    this.engineSubGain = ctx.createGain();
    this.engineSubGain.gain.value = 0;
    this.engineSub.connect(this.engineSubGain);
    this.engineSubGain.connect(this.masterGain);
    this.engineSub.start();
  }

  updateEngine(speed) {
    if (!this.engineOsc) return;
    const t = Math.min(Math.abs(speed) / 50, 1);
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + t * 80, now, 0.1);
    this.engineGain.gain.setTargetAtTime(0.008 + t * 0.03, now, 0.1);
    this.engineSub.frequency.setTargetAtTime(35 + t * 25, now, 0.1);
    this.engineSubGain.gain.setTargetAtTime(t * 0.015, now, 0.1);
  }

  // --- Music ---
  // Play real music track if loaded, fall back to synthesis
  startMusicTrack() {
    this._waitForSample('racing-music', () => {
      this._musicSample = this.playSample('racing-music', 0.45, true);
    });
    // Also start synth as fallback (will be quiet if sample plays)
    this.startMusic();
  }

  _waitForSample(name, cb) {
    if (this.samples[name]) { cb(); return; }
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      if (this.samples[name]) { clearInterval(check); cb(); }
      if (attempts > 50) clearInterval(check); // give up after 5s
    }, 100);
  }

  startMusic() {
    const ctx = this.ctx;
    const beatDuration = 60 / MUSIC.bpm;

    // Tanpura drone (Sa + Pa + Ma)
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.02;
    this.droneGain.connect(this.masterGain);

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 350;
    droneFilter.connect(this.droneGain);

    this.droneOsc = ctx.createOscillator();
    this.droneOsc.type = 'triangle';
    this.droneOsc.frequency.value = MUSIC.scale[0] / 2;
    this.droneOsc.connect(droneFilter);
    this.droneOsc.start();

    this.dronePa = ctx.createOscillator();
    this.dronePa.type = 'triangle';
    this.dronePa.frequency.value = MUSIC.scale[3] / 2;
    const paG = ctx.createGain();
    paG.gain.value = 0.5;
    this.dronePa.connect(paG);
    paG.connect(droneFilter);
    this.dronePa.start();

    // Ma drone (adds richness)
    const droneMa = ctx.createOscillator();
    droneMa.type = 'sine';
    droneMa.frequency.value = MUSIC.scale[2] / 2;
    const maG = ctx.createGain();
    maG.gain.value = 0.25;
    droneMa.connect(maG);
    maG.connect(droneFilter);
    droneMa.start();

    // Sitar melody pattern (longer, more musical phrases)
    const melodyPattern = [
      0, 1, 3, 4, 3, 1, 0, -1,  // Aaroha descent
      0, 3, 4, 5, 4, 3, 1, 0,   // Rise and fall
      4, 3, 1, 0, 1, 3, 4, 5,   // Low to high
      5, 4, 3, 1, 0, 0, -1, 0,  // Descent to Sa
    ];

    // Bansuri (flute) counter-melody -- plays every 4 beats, longer notes
    const flutePattern = [
      4, 5, 4, 3,    // High phrase
      3, 4, 3, 1,    // Mid phrase
      0, 1, 3, 4,    // Rising phrase
      5, 4, 1, 0,    // Cascading down
    ];

    // Madal pattern -- jhyaure (6/8 feel approximated in 4/4)
    // Dha Ghe _ Dha Te Na Ghe _
    const drumPattern = [
      { hit: true, pitch: 110, vol: 0.8, decay: 0.14 },   // Dha (bass)
      { hit: true, pitch: 160, vol: 0.35, decay: 0.08 },  // Ghe (mid)
      { hit: false },
      { hit: true, pitch: 110, vol: 0.6, decay: 0.12 },   // Dha
      { hit: true, pitch: 220, vol: 0.45, decay: 0.06 },  // Te (high)
      { hit: true, pitch: 180, vol: 0.35, decay: 0.07 },  // Na
      { hit: true, pitch: 160, vol: 0.3, decay: 0.08 },   // Ghe
      { hit: false },
    ];

    // Jhyamta (cymbal) -- hits on beats 1 and 5
    const cymbalPattern = [true, false, false, false, true, false, false, false];

    // Sarangi bass line (root notes, changes every 8 beats)
    const bassPattern = [0, 0, 3, 3, 0, 0, 4, 4]; // bars

    this.nextBeat = ctx.currentTime + 0.5;

    const scheduler = () => {
      if (!this.playing) return;

      while (this.nextBeat < ctx.currentTime + 0.25) {
        const t = this.nextBeat;
        const bi = this.beatIndex;
        const inBar = bi % 8;

        // Madal drum
        const drum = drumPattern[inBar];
        if (drum.hit) {
          this.playDrum(t, drum.pitch, drum.vol * this.intensity * this.comboMultiplier, drum.decay);
        }

        // Jhyamta cymbal
        if (cymbalPattern[inBar]) {
          this.playCymbal(t, 0.04 * this.intensity);
        }

        // Sitar melody (every 2 beats)
        if (inBar % 2 === 0) {
          const ni = melodyPattern[this.melodyIndex % melodyPattern.length];
          const freq = ni >= 0 ? MUSIC.scale[ni] : MUSIC.scale[0] / 2;
          this.playSitar(t, freq, 0.035 * this.intensity);
          this.melodyIndex++;
        }

        // Bansuri flute (every 4 beats, offset by 1)
        if (inBar === 1 || inBar === 5) {
          const fi = flutePattern[this.fluteIndex % flutePattern.length];
          const freq = MUSIC.scale[fi] * (fi > 3 ? 1 : 2);
          this.playBansuri(t, freq, 0.025 * this.intensity, beatDuration * 3);
          this.fluteIndex++;
        }

        // Sarangi bass drone shift (every 8 beats)
        if (inBar === 0) {
          const bassNote = bassPattern[this.barIndex % bassPattern.length];
          const freq = MUSIC.scale[bassNote] / 2;
          this.playSarangi(t, freq, 0.02 * this.intensity, beatDuration * 7);
          this.barIndex++;
        }

        this.beatIndex++;
        this.nextBeat += beatDuration;
      }
    };

    this.schedulerInterval = setInterval(scheduler, 40);
  }

  playDrum(time, pitch, volume, decay) {
    const ctx = this.ctx;

    // Noise component
    const bufLen = Math.floor(ctx.sampleRate * (decay + 0.02));
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.12));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = pitch;
    bpf.Q.value = 4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(volume * 0.14, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + decay);

    noise.connect(bpf);
    bpf.connect(g);
    g.connect(this.masterGain);
    noise.start(time);
    noise.stop(time + decay + 0.01);

    // Tonal body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, time);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, time + decay * 0.8);

    const og = ctx.createGain();
    og.gain.setValueAtTime(volume * 0.07, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + decay * 0.9);

    osc.connect(og);
    og.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + decay);
  }

  playCymbal(time, volume) {
    const ctx = this.ctx;
    const bufLen = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.08));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 6000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    noise.connect(hpf);
    hpf.connect(g);
    g.connect(this.reverbGain);
    noise.start(time);
    noise.stop(time + 0.12);
  }

  playSitar(time, freq, volume) {
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    // Characteristic sitar buzz (add harmonics)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * 2.01; // Slightly detuned overtone
    const o2g = ctx.createGain();
    o2g.gain.value = 0.015;
    osc2.connect(o2g);

    // Vibrato (gamak)
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5.5;
    const vibG = ctx.createGain();
    vibG.gain.value = freq * 0.012;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(time + 0.15); // Delayed vibrato
    vib.stop(time + 0.8);

    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, time);
    g.gain.setValueAtTime(volume * 0.65, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.55);

    // Brightness sweep
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(freq * 6, time);
    lpf.frequency.exponentialRampToValueAtTime(freq * 1.2, time + 0.35);

    osc.connect(lpf);
    o2g.connect(lpf);
    lpf.connect(g);
    g.connect(this.masterGain);
    g.connect(this.reverbGain);

    osc.start(time);
    osc.stop(time + 0.6);
    osc2.start(time);
    osc2.stop(time + 0.4);
  }

  playBansuri(time, freq, volume, duration) {
    const ctx = this.ctx;

    // Bansuri = breathy sine with slow attack, heavy vibrato
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Breath noise
    const bufLen = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * 0.08;
    }
    const breathNoise = ctx.createBufferSource();
    breathNoise.buffer = buf;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = freq;
    breathFilter.Q.value = 1;
    const breathGain = ctx.createGain();
    breathGain.gain.value = volume * 0.3;

    breathNoise.connect(breathFilter);
    breathFilter.connect(breathGain);

    // Vibrato (heavy, characteristic of bansuri)
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.5;
    const vibG = ctx.createGain();
    vibG.gain.value = freq * 0.02;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(time + 0.1);
    vib.stop(time + duration);

    const g = ctx.createGain();
    // Slow attack, sustain, release
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(volume, time + 0.12);
    g.gain.setValueAtTime(volume * 0.8, time + duration * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(g);
    breathGain.connect(g);
    g.connect(this.masterGain);
    g.connect(this.reverbGain);

    osc.start(time);
    osc.stop(time + duration + 0.01);
    breathNoise.start(time);
    breathNoise.stop(time + duration + 0.01);
  }

  playSarangi(time, freq, volume, duration) {
    const ctx = this.ctx;

    // Sarangi = bowed string, rich harmonics
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    // Sympathetic string resonance
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 3; // 3rd harmonic
    const o2g = ctx.createGain();
    o2g.gain.value = volume * 0.15;

    // Slow vibrato
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 5;
    const vibG = ctx.createGain();
    vibG.gain.value = freq * 0.008;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(time);
    vib.stop(time + duration);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(volume, time + 0.2);
    g.gain.setValueAtTime(volume * 0.7, time + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, time + duration);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = freq * 3;

    osc.connect(lpf);
    osc2.connect(o2g);
    o2g.connect(lpf);
    lpf.connect(g);
    g.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + duration + 0.01);
    osc2.start(time);
    osc2.stop(time + duration + 0.01);
  }

  // --- SFX ---
  playHonk() {
    if (!this.ctx) return;
    // Use real audio sample if loaded, fall back to synthesis
    if (this.samples.horn) {
      this.playSample('horn', 1.0);
      return;
    }
    // Synthesized Nepali rickshaw horn — loud two-tone "pee-paw"
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // High tone (pee)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(620, t);
    osc1.frequency.linearRampToValueAtTime(580, t + 0.15);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.25, t);
    g1.gain.setValueAtTime(0.25, t + 0.1);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc1.connect(g1);
    g1.connect(this.masterGain);
    osc1.start(t);
    osc1.stop(t + 0.22);
    this._autoClean(osc1, g1);

    // Low tone (paw)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(440, t + 0.18);
    osc2.frequency.linearRampToValueAtTime(410, t + 0.38);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.28, t + 0.18);
    g2.gain.setValueAtTime(0.28, t + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start(t + 0.18);
    osc2.stop(t + 0.47);
    this._autoClean(osc2, g2);

    // Sub harmonic for body
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 220;
    const gs = ctx.createGain();
    gs.gain.setValueAtTime(0.08, t);
    gs.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    sub.connect(gs);
    gs.connect(this.masterGain);
    sub.start(t);
    sub.stop(t + 0.37);
    this._autoClean(sub, gs);
  }

  playViolation() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(this.masterGain);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.setValueAtTime(140, t + 0.15);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.3);
    this._autoClean(osc, g);
  }

  playNearMiss() {
    if (!this.ctx) return;
    if (this.samples.nearmiss) { this.playSample('nearmiss', 0.4); return; }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(this.masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.08);
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.15);
    this._autoClean(osc, g);
  }

  // --- Ambient & Environmental ---
  startAmbient() {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Play looping ambiance sample if available
    if (this.samples.ambiance) {
      this._ambianceSample = this.playSample('ambiance', 0.35, true);
    }

    // Low rumble: brown noise through a lowpass filter
    const bufLen = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufLen; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + (0.02 * white)) / 1.02;
      d[i] = lastOut * 3.5;
    }

    this.ambientNoise = ctx.createBufferSource();
    this.ambientNoise.buffer = buf;
    this.ambientNoise.loop = true;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 100;
    lpf.Q.value = 0.5;

    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.value = 0.018;

    this.ambientNoise.connect(lpf);
    lpf.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientNoise.start();

    // Distant horn honks at random intervals
    const playRandomHonk = () => {
      if (!this.playing || !this.ctx) return;
      const t = ctx.currentTime;
      const pitch = 200 + Math.random() * 200;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = pitch;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g);
      g.connect(this.reverbGain);
      osc.start(t);
      osc.stop(t + 0.16);
    };

    const scheduleNextHonk = () => {
      if (!this.playing) return;
      const delay = 1500 + Math.random() * 3000;
      this.hornInterval = setTimeout(() => {
        playRandomHonk();
        scheduleNextHonk();
      }, delay);
    };
    scheduleNextHonk();
  }

  stopAmbient() {
    if (this.hornInterval) {
      clearTimeout(this.hornInterval);
      this.hornInterval = null;
    }
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
    if (this._ambianceSample) {
      try { this._ambianceSample.source.stop(); } catch (e) {}
      this._ambianceSample = null;
    }
  }

  updateWind(speed) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (!this.windNoise) {
      // Create white noise source
      const bufLen = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        d[i] = Math.random() * 2 - 1;
      }

      this.windNoise = ctx.createBufferSource();
      this.windNoise.buffer = buf;
      this.windNoise.loop = true;

      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'highpass';
      this.windFilter.frequency.value = 3000;
      this.windFilter.Q.value = 0.5;

      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;

      this.windNoise.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      this.windNoise.start();
    }

    const t = Math.min(Math.abs(speed) / 50, 1);
    const gain = t * 0.015;
    const freq = 3000 - t * 1500; // 3000Hz at slow, 1500Hz at fast

    this.windGain.gain.setTargetAtTime(gain, now, 0.2);
    this.windFilter.frequency.setTargetAtTime(freq, now, 0.2);
  }

  startRainSound() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // White noise through bandpass for rain
    const bufLen = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = Math.random() * 2 - 1;
    }

    this.rainNoise = ctx.createBufferSource();
    this.rainNoise.buffer = buf;
    this.rainNoise.loop = true;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 800;
    bpf.Q.value = 0.5;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.setValueAtTime(0.001, now);
    this.rainGain.gain.linearRampToValueAtTime(0.025, now + 2);

    this.rainNoise.connect(bpf);
    bpf.connect(this.rainGain);
    this.rainGain.connect(this.masterGain);
    this.rainNoise.start();
  }

  stopRainSound() {
    if (!this.ctx || !this.rainGain) return;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(0, now, 0.3);
    // Disconnect after fade out
    const rainNoise = this.rainNoise;
    const rainGain = this.rainGain;
    setTimeout(() => {
      try {
        if (rainNoise) rainNoise.stop();
        if (rainGain) rainGain.disconnect();
      } catch (e) { /* already stopped */ }
    }, 1000);
    this.rainNoise = null;
    this.rainGain = null;
  }

  playCollisionThud(intensity) {
    if (!this.ctx) return;
    const vol = Math.max(0, Math.min(1, intensity));
    // Use sample if available — pick from collision sounds
    if (this.samples.collision) {
      this.playSample(vol > 0.5 ? 'metal-crash' : 'collision', 0.5 * vol);
      return;
    }
    if (this.samples.crash) {
      this.playSample('crash', 0.5 * vol);
      return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const synthVol = 0.06 * vol;

    // Low sine thud with pitch drop
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);

    const g = ctx.createGain();
    g.gain.setValueAtTime(synthVol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);

    // Noise burst for crunch texture
    const bufLen = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.15));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(synthVol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noise.connect(ng);
    ng.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.06);
  }

  playCelebration() {
    if (!this.ctx) return;
    if (this.samples.gong) { this.playSample('gong', 0.4); return; }
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Fast ascending metallic tones: 3 triangle wave notes
    const notes = [1200, 1600, 2000];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.15);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.17);
    });

    // Shimmer: high-frequency sine sweep
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(3000, t + 0.15);
    shimmer.frequency.linearRampToValueAtTime(5000, t + 0.45);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.01, t + 0.15);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    shimmer.connect(sg);
    sg.connect(this.masterGain);
    sg.connect(this.reverbGain);
    shimmer.start(t + 0.15);
    shimmer.stop(t + 0.47);
  }

  playAiyaa() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Voice-like exclamation: sine with frequency swoop "aiyaaa!"
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Swoop from high to mid: surprised vocal contour
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(450, t + 0.08);
    osc.frequency.linearRampToValueAtTime(350, t + 0.2);
    osc.frequency.linearRampToValueAtTime(280, t + 0.4);

    // Nasal overtone
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(900, t);
    osc2.frequency.linearRampToValueAtTime(700, t + 0.15);
    osc2.frequency.linearRampToValueAtTime(560, t + 0.4);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.012;
    osc2.connect(o2g);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.04);
    g.gain.setValueAtTime(0.035, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(g);
    o2g.connect(g);
    g.connect(this.masterGain);
    g.connect(this.reverbGain);

    osc.start(t);
    osc.stop(t + 0.5);
    osc2.start(t);
    osc2.stop(t + 0.45);
  }

  playMoo() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Low mooing: sine with gentle pitch wobble
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(160, t + 0.15);
    osc.frequency.linearRampToValueAtTime(130, t + 0.4);
    osc.frequency.linearRampToValueAtTime(120, t + 0.7);

    // Nasal harmonic for cow timbre
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(280, t);
    osc2.frequency.linearRampToValueAtTime(240, t + 0.7);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.015;
    osc2.connect(o2g);

    // Vibrato for organic feel
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4;
    const vibG = ctx.createGain();
    vibG.gain.value = 8;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vib.start(t + 0.1);
    vib.stop(t + 0.7);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.08);
    g.gain.setValueAtTime(0.03, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    osc.connect(g);
    o2g.connect(g);
    g.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.8);
    osc2.start(t);
    osc2.stop(t + 0.75);
  }

  playSoftCrash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Gentle metallic crunch -- not aggressive
    const bufLen = Math.floor(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.2));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 400;
    bpf.Q.value = 1.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.025, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noise.connect(bpf);
    bpf.connect(g);
    g.connect(this.masterGain);
    noise.start(t);
    noise.stop(t + 0.14);
  }

  playTempleBells() {
    if (!this.ctx) return;
    if (this.samples.bell) { this.playSample('bell', 0.3); return; }
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Fundamental at C5 (523Hz)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 523;

    // Slightly detuned overtone at ~C6 (1047Hz)
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 1047;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.006; // Overtone quieter than fundamental

    const g = ctx.createGain();
    // Slow attack, long decay
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.012, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.3);

    osc.connect(g);
    osc2.connect(o2g);
    o2g.connect(g);
    g.connect(this.reverbGain);

    osc.start(t);
    osc.stop(t + 2.4);
    osc2.start(t);
    osc2.stop(t + 2.4);
  }

  setTimeOfDay(progress) {
    if (!this.droneGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const p = Math.max(0, Math.min(1, progress));

    // Louder at dusk/night (0.025-0.035), quieter at midday (0.015)
    // Use a curve: quiet at midday (p~0.5), louder at edges
    let droneVol;
    if (p < 0.5) {
      // Dawn to midday: 0.025 -> 0.015
      droneVol = 0.025 - (p / 0.5) * 0.01;
    } else {
      // Midday to night: 0.015 -> 0.035
      droneVol = 0.015 + ((p - 0.5) / 0.5) * 0.02;
    }

    this.droneGain.gain.setTargetAtTime(droneVol, now, 1.0);

    // Detune the drone slightly at night for melancholic feel
    if (p > 0.6 && this.droneOsc) {
      const detune = (p - 0.6) / 0.4 * -15; // Up to -15 cents
      this.droneOsc.detune.setTargetAtTime(detune, now, 0.5);
    } else if (this.droneOsc) {
      this.droneOsc.detune.setTargetAtTime(0, now, 0.5);
    }
  }

  setComboLevel(combo) {
    const level = Math.max(0, Math.min(4, combo));
    this.comboMultiplier = 1.0 + level * 0.15;
  }

  setIntensity(val) {
    this.intensity = Math.max(0.3, Math.min(1, val));
  }

  toggleMute() {
    if (!this.masterGain) return false;
    this.muted = !this.muted;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  stop() {
    this.playing = false;
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    const t = this.ctx?.currentTime || 0;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, t, 0.1);
    if (this.engineSubGain) this.engineSubGain.gain.setTargetAtTime(0, t, 0.1);
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(0, t, 0.5);
    this.stopAmbient();
    if (this.rainGain) this.stopRainSound();
  }

  destroy() {
    this.stop();
    if (this.ctx) this.ctx.close();
  }
}
