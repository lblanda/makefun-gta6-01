// audio.js — all sound is procedural WebAudio: engine hum, sirens, gunshots,
// thuds, chimes and a slow synth pad for music. Nothing is loaded from disk.
export function createAudio() {
  const a = {
    ctx: null, master: null, muted: false,
    engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    padOsc: [], padGain: null, padTimer: 0, padStep: 0,
  };

  a.init = () => {
    if (a.ctx) { if (a.ctx.state === 'suspended') a.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      a.ctx = new AC();
      a.master = a.ctx.createGain();
      a.master.gain.value = a.muted ? 0 : 0.5;
      a.master.connect(a.ctx.destination);
      // Engine: low sawtooth through a lowpass, pitch follows speed.
      a.engineOsc = a.ctx.createOscillator();
      a.engineOsc.type = 'sawtooth';
      a.engineOsc.frequency.value = 55;
      a.engineGain = a.ctx.createGain();
      a.engineGain.gain.value = 0;
      const lp = a.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      a.engineOsc.connect(lp); lp.connect(a.engineGain); a.engineGain.connect(a.master);
      a.engineOsc.start();
      // Siren: two-tone square wave, gain follows nearest police distance.
      a.sirenOsc = a.ctx.createOscillator();
      a.sirenOsc.type = 'square';
      a.sirenOsc.frequency.value = 750;
      a.sirenGain = a.ctx.createGain();
      a.sirenGain.gain.value = 0;
      a.sirenOsc.connect(a.sirenGain); a.sirenGain.connect(a.master);
      a.sirenOsc.start();
      // Music pad: two detuned triangles playing a slow chord walk.
      a.padGain = a.ctx.createGain();
      a.padGain.gain.value = 0.05;
      a.padGain.connect(a.master);
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [164.8, 220, 261.6]];
      a.padChords = chords;
      a.padOsc = chords[0].map((f) => {
        const o = a.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f;
        o.connect(a.padGain); o.start();
        return o;
      });
      // Headless / autoplay-blocked contexts start suspended: resume on the
      // first real gesture so sound appears without a second click.
      const resume = () => { if (a.ctx && a.ctx.state === 'suspended') a.ctx.resume(); };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    } catch { a.ctx = null; }
  };

  a.toggleMute = () => {
    a.muted = !a.muted;
    if (a.master) a.master.gain.value = a.muted ? 0 : 0.5;
    return a.muted;
  };

  function noiseBuffer(dur) {
    const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * dur, a.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function blip(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!a.ctx) return;
    const o = a.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.ctx.currentTime + dur);
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(vol, a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + dur);
    o.connect(g); g.connect(a.master);
    o.start(); o.stop(a.ctx.currentTime + dur);
  }
  function noiseHit(dur, vol, freq = 1200) {
    if (!a.ctx) return;
    const src = a.ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(vol, a.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.ctx.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(a.master);
    src.start();
  }

  a.gunshot = () => noiseHit(0.14, 0.5, 2400);
  a.punch = () => { noiseHit(0.1, 0.4, 500); blip(90, 0.12, 'sine', 0.35, 50); };
  a.thud = () => { noiseHit(0.16, 0.35, 320); blip(70, 0.16, 'sine', 0.3, 40); };
  a.hurt = () => blip(220, 0.25, 'sawtooth', 0.2, 110);
  a.door = () => { noiseHit(0.08, 0.25, 900); blip(140, 0.08, 'square', 0.12); };
  a.engineStart = () => { blip(60, 0.4, 'sawtooth', 0.2, 160); noiseHit(0.3, 0.12, 600); };
  a.reload = () => { blip(500, 0.07, 'square', 0.15); setTimeout(() => blip(700, 0.07, 'square', 0.15), 120); };
  a.explosion = () => { noiseHit(0.9, 0.7, 500); blip(55, 0.8, 'sine', 0.5, 28); };
  a.sirenBlip = () => { blip(880, 0.18, 'square', 0.14); setTimeout(() => blip(660, 0.18, 'square', 0.14), 180); };
  a.chime = () => { blip(880, 0.12, 'sine', 0.25); setTimeout(() => blip(1318, 0.18, 'sine', 0.25), 110); };
  a.jingle = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.28), i * 130)); };
  a.fail = () => { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'triangle', 0.25), i * 170)); };

  // Called every frame: engine pitch, siren wail, pad chord walk.
  a.update = (dt, speedKmh, nearestPolice) => {
    if (!a.ctx) return;
    if (a.engineGain) {
      a.engineGain.gain.value = speedKmh > 1 ? 0.05 + Math.min(0.09, speedKmh / 900) : 0.02;
      a.engineOsc.frequency.value = 50 + speedKmh * 1.6;
    }
    if (a.sirenGain) {
      const on = nearestPolice < 120;
      a.sirenGain.gain.value = on ? Math.max(0, 0.05 * (1 - nearestPolice / 120)) : 0;
      if (on) a.sirenOsc.frequency.value = (Math.floor(performance.now() / 450) % 2 === 0) ? 750 : 950;
    }
    a.padTimer += dt;
    if (a.padTimer > 4) {
      a.padTimer = 0;
      a.padStep = (a.padStep + 1) % a.padChords.length;
      a.padChords[a.padStep].forEach((f, i) => {
        if (a.padOsc[i]) a.padOsc[i].frequency.linearRampToValueAtTime(f, a.ctx.currentTime + 1.5);
      });
    }
  };

  return a;
}
