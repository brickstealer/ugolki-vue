/**
 * Звук: короткие синтезированные тона на WebAudio (порт из оригинала).
 * Никаких ассетов; включение/выключение управляется снаружи (App).
 */
let enabled = true;
let ac: AudioContext | null = null;

type AudioCtor = typeof AudioContext;

function audioContext(): AudioContext | null {
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) ?? null;
  if (!Ctor) return null;
  ac = ac ?? new Ctor();
  if (ac.state === 'suspended') void ac.resume();
  return ac;
}

function tone(f: number, f2: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
  if (!enabled) return;
  try {
    const ctx = audioContext();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  } catch {
    /* без звука */
  }
}

export function setSoundEnabled(v: boolean): void {
  enabled = v;
}

export const sfx = {
  step(): void { tone(260, 190, 0.09, 'sine', 0.05); },
  hop(n = 0): void { tone(400 + n * 70, 700 + n * 70, 0.09, 'triangle', 0.05); },
  land(): void { tone(150, 110, 0.11, 'sine', 0.06); },
  select(): void { tone(620, 620, 0.05, 'sine', 0.035); },
  win(): void { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0, 0.3, 'sine', 0.06, i * 0.12)); },
  lose(): void { [392, 311, 233].forEach((f, i) => tone(f, 0, 0.35, 'sine', 0.055, i * 0.14)); },
  draw(): void { [440, 415].forEach((f, i) => tone(f, 0, 0.3, 'sine', 0.05, i * 0.15)); },
};
