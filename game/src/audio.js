// Sound, synthesized: no audio files, no network. A shared AudioContext and a noise
// buffer feed short envelopes for shots, hits, plants and round stingers. Created lazily
// on the first user gesture, so autoplay rules never block it.
let ctx = null;
let noiseBuf = null;
let master = null;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

function noise(dur, filterFreq, gain, type = 'lowpass') {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur);
}

function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
  shot(kind) {
    if (kind === 'sniper') { noise(0.28, 900, 0.5); tone(140, 0.2, 0.4, 'sawtooth', 50); }
    else if (kind === 'shotgun') { noise(0.22, 1200, 0.5); tone(110, 0.16, 0.4, 'square', 45); }
    else if (kind === 'smg') { noise(0.09, 1800, 0.28); tone(190, 0.07, 0.2, 'square', 90); }
    else if (kind === 'pistol') { noise(0.12, 1500, 0.32); tone(170, 0.09, 0.25, 'square', 70); }
    else { noise(0.14, 1400, 0.4); tone(150, 0.11, 0.3, 'sawtooth', 60); }
  },
  dryFire() { tone(900, 0.05, 0.12, 'square'); },
  reload() { tone(500, 0.05, 0.15, 'square'); setTimeout(() => tone(700, 0.05, 0.15, 'square'), 180); },
  hit() { tone(1200, 0.06, 0.2, 'sine'); },
  headshot() { tone(1600, 0.1, 0.22, 'sine'); setTimeout(() => tone(2100, 0.08, 0.18, 'sine'), 60); },
  hurt() { tone(220, 0.15, 0.3, 'sawtooth', 90); },
  kill() { tone(520, 0.12, 0.25, 'triangle', 780); },
  plant() { tone(880, 0.09, 0.2, 'sine'); },
  beep() { tone(1050, 0.07, 0.16, 'sine'); },
  defuse() { tone(660, 0.09, 0.2, 'sine'); setTimeout(() => tone(880, 0.09, 0.2, 'sine'), 120); },
  explosion() { noise(0.9, 300, 0.8); tone(70, 0.8, 0.5, 'sine', 30); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.22, 'triangle'), i * 110)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'triangle'), i * 120)); },
  buy() { tone(740, 0.06, 0.18, 'sine'); setTimeout(() => tone(990, 0.06, 0.18, 'sine'), 70); },
  denied() { tone(180, 0.12, 0.2, 'square'); },
  step() { noise(0.05, 500, 0.06); },
  grenade() { noise(0.1, 900, 0.2, 'bandpass'); },
};
