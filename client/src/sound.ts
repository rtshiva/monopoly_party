// Tiny WebAudio synth — no audio assets, works offline. All no-ops until first
// user gesture (AudioContext created lazily) and when muted.

let ctx: AudioContext | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('monopoly.muted') === '1';
let volume = typeof localStorage !== 'undefined' && localStorage.getItem('monopoly.volume') != null
  ? Math.max(0, Math.min(1, parseFloat(localStorage.getItem('monopoly.volume')!)))
  : 0.8;

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('monopoly.muted', m ? '1' : '0'); } catch { /* noop */ }
}
export function getVolume() { return volume; }
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('monopoly.volume', volume.toString()); } catch { /* noop */ }
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function blip(freq: number, at: number, dur = 0.12, type: OscillatorType = 'sine', gain = 0.15) {
  const c = ac();
  if (!c) return;
  const effectiveGain = Math.max(0.0001, gain * volume);
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(effectiveGain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Dice rattle: 4 quick square ticks. Call on ROLL tap (user gesture). */
export function sndRoll() { [0, 0.07, 0.14, 0.24].forEach((d, i) => blip(220 + i * 90, d, 0.08, 'square', 0.06)); }
/** Single rattle tick — call on every shuffle step while holding ROLL. */
export function sndTick() { blip(220 + Math.random() * 420, 0, 0.05, 'square', 0.05); }
/** Cash register-ish: two ascending sines. */
export function sndCash() { blip(660, 0); blip(990, 0.09); }
/** Deed purchase: soft triad. */
export function sndBuy() { [523, 659, 784].forEach((f, i) => blip(f, i * 0.07, 0.14, 'triangle')); }
/** Outbid / error: low buzz. */
export function sndError() { blip(140, 0, 0.2, 'sawtooth', 0.1); }
/** Victory arpeggio. */
export function sndWin() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => blip(f, i * 0.11, 0.16, 'triangle')); }
