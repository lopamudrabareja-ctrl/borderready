// Alert tones made with the Web Audio API (no sound files). Only ever played from a click or a sent message.
let ctx: AudioContext | null = null;

function tone(c: AudioContext, start: number, freq: number, dur: number, type: OscillatorType, peak: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/** red: two low, urgent buzzes. amber: one soft two-note chime. */
export function playAlert(kind: "red" | "amber") {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime + 0.01;
    if (kind === "red") {
      tone(ctx, t, 220, 0.18, "square", 0.12);
      tone(ctx, t + 0.24, 196, 0.26, "square", 0.12);
    } else {
      tone(ctx, t, 880, 0.22, "sine", 0.18);
      tone(ctx, t + 0.18, 660, 0.32, "sine", 0.15);
    }
  } catch { /* audio unavailable: the on-screen alert still shows */ }
}
