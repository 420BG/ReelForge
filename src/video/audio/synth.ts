import type { MusicMood } from "@/content/types";
import { runFfmpeg } from "@/video/composition/ffmpeg";

/**
 * Copyright-safe audio layer: every music bed and sound effect here is synthesized
 * from math expressions with ffmpeg at render time. No samples, no third-party music.
 * A licensed library can be used instead by placing files in AGENT_MUSIC_DIR/<mood>/.
 */

const SR = 44100;

function sel(index: string, values: (string | number)[]): string {
  if (values.length === 1) return String(values[0]);
  return values.slice(0, -1).reduceRight<string>((acc, value, i) => `if(eq(${index},${i}),${value},${acc})`, String(values[values.length - 1]));
}

type MusicSpec = { chords: number[][]; bar: number; arpStep: number | null; kick: number | null; drone: boolean; heartbeat: boolean; lowpass: number; gain: number };

const C = { C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440 };

const MUSIC: Record<MusicMood, MusicSpec> = {
  suspense: { chords: [[C.A3 / 2, C.C3, C.E3]], bar: 8, arpStep: null, kick: null, drone: true, heartbeat: true, lowpass: 2400, gain: 1.0 },
  "dark-ambient": { chords: [[C.A3 / 2, C.C3, C.E3], [C.F3 / 2, C.A3 / 2, C.C3]], bar: 8, arpStep: null, kick: null, drone: true, heartbeat: false, lowpass: 2000, gain: 1.0 },
  romantic: { chords: [[C.C4, C.E4, C.G4], [C.A3, C.C4, C.E4], [C.F3, C.A3, C.C4], [C.G3, C.B3, C.D4]], bar: 4, arpStep: 0.5, kick: null, drone: false, heartbeat: false, lowpass: 5200, gain: 0.9 },
  emotional: { chords: [[C.A3, C.C4, C.E4], [C.F3, C.A3, C.C4], [C.C4, C.E4, C.G4], [C.G3, C.B3, C.D4]], bar: 4, arpStep: 0.5, kick: null, drone: false, heartbeat: false, lowpass: 4800, gain: 0.9 },
  calm: { chords: [[C.C4, C.E4, C.G4], [C.F3, C.A3, C.C4]], bar: 6, arpStep: null, kick: null, drone: false, heartbeat: false, lowpass: 4000, gain: 0.8 },
  uplifting: { chords: [[C.C4, C.E4, C.G4], [C.G3, C.B3, C.D4], [C.A3, C.C4, C.E4], [C.F3, C.A3, C.C4]], bar: 2, arpStep: 0.25, kick: 0.5, drone: false, heartbeat: false, lowpass: 7000, gain: 0.85 },
  epic: { chords: [[C.D3, C.F3, C.A3], [C.Bb3 / 2, C.D3, C.F3], [C.F3, C.A3, C.C4], [C.C3, C.E3, C.G3]], bar: 2, arpStep: 0.25, kick: 0.5, drone: true, heartbeat: false, lowpass: 6000, gain: 0.9 },
  curious: { chords: [[C.E3, C.G3, C.B3], [C.C3, C.E3, C.G3], [C.D3, C.F3 * 1.0595, C.A3]], bar: 3, arpStep: 0.375, kick: null, drone: false, heartbeat: false, lowpass: 6500, gain: 0.8 },
  mysterious: { chords: [[C.A3, C.C4, C.E4], [C.F3, C.A3, C.C4], [C.E3, C.G3 * 1.0595, C.B3]], bar: 4, arpStep: 0.75, kick: null, drone: true, heartbeat: false, lowpass: 3500, gain: 0.9 },
  playful: { chords: [[C.C4, C.E4, C.G4], [C.F3, C.A3, C.C4], [C.G3, C.B3, C.D4], [C.C4, C.E4, C.G4]], bar: 2, arpStep: 0.25, kick: null, drone: false, heartbeat: false, lowpass: 8000, gain: 0.8 },
};

export function musicExpression(mood: MusicMood) {
  const spec = MUSIC[mood];
  const n = spec.chords.length;
  const cycle = spec.bar * n;
  const idx = `floor(mod(t,${cycle})/${spec.bar})`;
  const local = `mod(t,${spec.bar})`;
  const env = `(1-exp(-2.5*${local}))*min(1,(${spec.bar}-${local})*2)`;
  const parts: string[] = [];
  for (let note = 0; note < 3; note++) {
    const f = sel(idx, spec.chords.map((chord) => chord[note]));
    parts.push(`0.055*sin(2*PI*${f}*t)+0.03*sin(2*PI*${f}*1.004*t)`);
  }
  let expr = `(${parts.join("+")})*${env}`;
  if (spec.arpStep) {
    const step = spec.arpStep;
    const noteIdx = `mod(floor(t/${step}),4)`;
    const noteFreqs = [0, 1, 2, 1].map((note) => sel(idx, spec.chords.map((chord) => chord[note] * 2)));
    expr += `+0.07*sin(2*PI*${sel(noteIdx, noteFreqs)}*t)*exp(-5*mod(t,${step}))*min(1,mod(t,${step})*80)`;
  }
  if (spec.drone) {
    const root = spec.chords[0][0];
    expr += `+0.12*sin(2*PI*${root / 2}*t)*(0.6+0.4*sin(2*PI*0.07*t))+0.07*sin(2*PI*${(root / 2) * 1.059}*t)`;
  }
  if (spec.heartbeat) expr += `+0.3*sin(2*PI*48*t)*(exp(-18*mod(t,1.1))+0.7*exp(-18*mod(t+0.85,1.1)))+0.018*sin(2*PI*(1320+9*sin(2*PI*0.3*t))*t)`;
  if (spec.kick) expr += `+0.28*sin(2*PI*52*mod(t,${spec.kick})*(1+2.2*exp(-22*mod(t,${spec.kick}))))*exp(-7*mod(t,${spec.kick}))`;
  return { expr: `(${expr})*${spec.gain}`, lowpass: spec.lowpass, drone: spec.drone };
}

export async function renderMusic(mood: MusicMood, seconds: number, out: string) {
  const { expr, lowpass, drone } = musicExpression(mood);
  const duration = Math.max(1, seconds + 0.5).toFixed(2);
  const filters = [
    `[0:a]lowpass=f=${lowpass},aecho=0.8:0.55:70|140:0.22|0.12${drone ? "" : ",highpass=f=60"}[m]`,
    drone ? `[1:a]lowpass=f=320,volume=0.35[n]` : "",
    drone ? `[m][n]amix=inputs=2:normalize=0[mx]` : `[m]anull[mx]`,
    `[mx]afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, Number(duration) - 2).toFixed(2)}:d=2,pan=stereo|c0=c0|c1=c0,loudnorm=I=-20:TP=-2:LRA=11,aresample=44100[out]`,
  ].filter(Boolean).join(";");
  const args = ["-f", "lavfi", "-i", `aevalsrc='${expr}':s=${SR}:d=${duration}`];
  if (drone) args.push("-f", "lavfi", "-i", `anoisesrc=color=brown:amplitude=0.4:d=${duration}:r=${SR}`);
  args.push("-filter_complex", filters, "-map", "[out]", "-ar", String(SR), "-c:a", "pcm_s16le", out);
  await runFfmpeg(args, 120_000);
}

/* ---------------- Sound effects ---------------- */

type SfxSpec = {
  source: { kind: "eval"; expr: string } | { kind: "noise"; color: "white" | "pink" | "brown"; amplitude: number };
  filters: string;
  maxSeconds: number;
  ambient: boolean;
  gain: number;
};

const SFX: Record<string, SfxSpec> = {
  wind: { source: { kind: "noise", color: "brown", amplitude: 0.6 }, filters: "bandpass=f=420:width_type=h:w=380,tremolo=f=0.25:d=0.7", maxSeconds: 30, ambient: true, gain: 1.0 },
  rain: { source: { kind: "noise", color: "pink", amplitude: 0.5 }, filters: "highpass=f=900,lowpass=f=7500", maxSeconds: 30, ambient: true, gain: 0.75 },
  "soft rain": { source: { kind: "noise", color: "pink", amplitude: 0.35 }, filters: "highpass=f=1200,lowpass=f=6000", maxSeconds: 30, ambient: true, gain: 0.65 },
  thunder: { source: { kind: "noise", color: "brown", amplitude: 1 }, filters: "lowpass=f=260,afade=t=in:d=0.08,afade=t=out:st=0.4:d=3.2", maxSeconds: 3.8, ambient: false, gain: 1.4 },
  heartbeat: { source: { kind: "eval", expr: "0.8*sin(2*PI*50*t)*(exp(-20*mod(t,0.95))+0.75*exp(-20*mod(t+0.73,0.95)))" }, filters: "lowpass=f=180", maxSeconds: 6, ambient: false, gain: 1.2 },
  footsteps: { source: { kind: "eval", expr: "(random(0)*2-1)*exp(-38*mod(t,0.55))" }, filters: "lowpass=f=900,highpass=f=80", maxSeconds: 4, ambient: false, gain: 1.3 },
  knock: { source: { kind: "eval", expr: "((random(0)*2-1)*0.6+0.6*sin(2*PI*110*t))*exp(-55*mod(t,0.26))*lt(mod(t,1.8),0.78)" }, filters: "lowpass=f=650", maxSeconds: 2.6, ambient: false, gain: 1.3 },
  "door creak": { source: { kind: "eval", expr: "0.45*(sin(2*PI*(170*t+22*sin(2*PI*0.7*t)+3*sin(2*PI*31*t)))+0.6*sin(4*PI*(170*t+22*sin(2*PI*0.7*t)+3*sin(2*PI*31*t)))+0.4*sin(6*PI*(170*t+22*sin(2*PI*0.7*t)+3*sin(2*PI*31*t))))*(0.55+0.45*sin(2*PI*9*t))*min(1,t*6)*min(1,(2.4-t)*3)" }, filters: "bandpass=f=600:width_type=h:w=900,aecho=0.6:0.4:40:0.2", maxSeconds: 2.4, ambient: false, gain: 1.1 },
  whoosh: { source: { kind: "noise", color: "pink", amplitude: 0.9 }, filters: "bandpass=f=1800:width_type=h:w=2600,afade=t=in:d=0.35,afade=t=out:st=0.35:d=0.45", maxSeconds: 0.85, ambient: false, gain: 0.8 },
  impact: { source: { kind: "eval", expr: "0.9*sin(2*PI*(38*t+55*(1-exp(-9*t))/9))*exp(-3.2*t)+0.5*(random(0)*2-1)*exp(-18*t)" }, filters: "lowpass=f=1400,aecho=0.7:0.5:90:0.25", maxSeconds: 2.2, ambient: false, gain: 1.3 },
  riser: { source: { kind: "eval", expr: "0.35*sin(2*PI*(120*t+170*t*t))*min(1,t/2.6)+0.25*(random(0)*2-1)*min(1,t/2.6)" }, filters: "highpass=f=90,afade=t=out:st=2.5:d=0.25", maxSeconds: 2.75, ambient: false, gain: 0.7 },
  "electrical hum": { source: { kind: "eval", expr: "0.3*sin(2*PI*60*t)+0.16*sin(2*PI*120*t)+0.08*sin(2*PI*180*t)+0.03*(random(0)*2-1)" }, filters: "lowpass=f=900", maxSeconds: 30, ambient: true, gain: 0.35 },
  "clock tick": { source: { kind: "eval", expr: "(random(0)*2-1)*exp(-320*mod(t,1))+0.6*(random(1)*2-1)*exp(-320*mod(t+0.5,1))" }, filters: "highpass=f=1800", maxSeconds: 30, ambient: true, gain: 0.8 },
  "phone ring": { source: { kind: "eval", expr: "0.22*(sin(2*PI*440*t)+sin(2*PI*480*t))*lt(mod(t,4),1.6)" }, filters: "highpass=f=300,lowpass=f=3400", maxSeconds: 5.5, ambient: false, gain: 0.8 },
  "phone vibrate": { source: { kind: "eval", expr: "0.5*sin(2*PI*150*t)*(0.6+0.4*sin(2*PI*31*t))*lt(mod(t,1.2),0.5)" }, filters: "lowpass=f=600", maxSeconds: 3.2, ambient: false, gain: 0.9 },
  glitch: { source: { kind: "eval", expr: "(random(0)*2-1)*gt(sin(2*PI*7*t)*sin(2*PI*13*t),0.2)" }, filters: "bandpass=f=2500:width_type=h:w=3000", maxSeconds: 0.9, ambient: false, gain: 0.55 },
  "city night": { source: { kind: "noise", color: "pink", amplitude: 0.35 }, filters: "lowpass=f=700,tremolo=f=0.11:d=0.35", maxSeconds: 30, ambient: true, gain: 0.8 },
  crowd: { source: { kind: "noise", color: "pink", amplitude: 0.4 }, filters: "bandpass=f=900:width_type=h:w=1200,tremolo=f=3:d=0.2", maxSeconds: 30, ambient: true, gain: 0.9 },
  "ocean waves": { source: { kind: "noise", color: "brown", amplitude: 0.7 }, filters: "lowpass=f=1100,tremolo=f=0.13:d=0.85", maxSeconds: 30, ambient: true, gain: 0.5 },
  "fire crackle": { source: { kind: "eval", expr: "0.8*(random(0)*2-1)*gt(random(1),0.9985)+0.05*(random(2)*2-1)" }, filters: "lowpass=f=5000,highpass=f=200", maxSeconds: 30, ambient: true, gain: 1.1 },
  birds: { source: { kind: "eval", expr: "0.18*sin(2*PI*(3100*t+180*sin(2*PI*14*t)))*lt(mod(t,1.7),0.14)+0.12*sin(2*PI*(3900*t+220*sin(2*PI*18*t)))*between(mod(t,2.3),0.9,1.0)" }, filters: "highpass=f=1500", maxSeconds: 30, ambient: true, gain: 0.8 },
  chime: { source: { kind: "eval", expr: "(0.3*sin(2*PI*1318.5*t)+0.2*sin(2*PI*1975.5*t)+0.15*sin(2*PI*2637*t))*exp(-2.5*t)" }, filters: "aecho=0.7:0.5:120:0.3", maxSeconds: 2.2, ambient: false, gain: 0.7 },
  "distant heartbeat": { source: { kind: "eval", expr: "0.6*sin(2*PI*46*t)*(exp(-20*mod(t,1.05))+0.7*exp(-20*mod(t+0.8,1.05)))" }, filters: "lowpass=f=140", maxSeconds: 30, ambient: true, gain: 0.45 },
};

const ALIASES: [RegExp, string][] = [
  [/thunder|storm|lightning/i, "thunder"],
  [/heart ?beat|pulse/i, "heartbeat"],
  [/foot ?steps?|walking|running/i, "footsteps"],
  [/knock|bang on/i, "knock"],
  [/creak|door open|hinge/i, "door creak"],
  [/whoosh|swoosh|transition/i, "whoosh"],
  [/impact|hit|boom|slam|thud|sting/i, "impact"],
  [/riser|rising|build/i, "riser"],
  [/hum|buzz|electric|fluorescent/i, "electrical hum"],
  [/clock|tick/i, "clock tick"],
  [/vibrat/i, "phone vibrate"],
  [/ring|phone call|telephone/i, "phone ring"],
  [/glitch|static|distort/i, "glitch"],
  [/soft rain|drizzle/i, "soft rain"],
  [/rain/i, "rain"],
  [/wind|breeze|howl/i, "wind"],
  [/city|traffic|street/i, "city night"],
  [/crowd|people|murmur|chatter/i, "crowd"],
  [/ocean|waves?|sea|shore/i, "ocean waves"],
  [/fire|crackl|flame|campfire/i, "fire crackle"],
  [/birds?|chirp/i, "birds"],
  [/chime|bell|sparkle|twinkle|magic/i, "chime"],
];

export function resolveSfx(label: string): string | null {
  const key = label.trim().toLowerCase();
  if (SFX[key]) return key;
  for (const [pattern, id] of ALIASES) if (pattern.test(key)) return id;
  return null;
}

export function isAmbient(id: string) { return Boolean(SFX[id]?.ambient); }

export async function renderSfx(id: string, seconds: number, out: string) {
  const spec = SFX[id];
  if (!spec) throw new Error(`Unknown sound effect ${id}`);
  const duration = Math.max(0.3, Math.min(spec.maxSeconds, seconds)).toFixed(2);
  const source = spec.source.kind === "eval"
    ? `aevalsrc='${spec.source.expr}':s=${SR}:d=${duration}`
    : `anoisesrc=color=${spec.source.color}:amplitude=${spec.source.amplitude}:d=${duration}:r=${SR}`;
  const fade = spec.ambient ? `,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, Number(duration) - 0.8).toFixed(2)}:d=0.8` : "";
  await runFfmpeg(["-f", "lavfi", "-i", source, "-af", `${spec.filters}${fade},volume=${spec.gain},pan=stereo|c0=c0|c1=c0,alimiter=limit=0.95`, "-ar", String(SR), "-c:a", "pcm_s16le", out], 60_000);
  return Number(duration);
}
