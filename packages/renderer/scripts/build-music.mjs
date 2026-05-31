#!/usr/bin/env node
// Generate chalkboard's bundled background-music library.
//
// Everything here is synthesised from scratch with `sox` + `ffmpeg`, so the
// output is unambiguously original and ships CC0 (public domain) — no scraped
// tracks, no attribution strings, no licence ambiguity in an MIT repo.
//
// Each mood is a short, seamlessly-loopable bed built from three layers:
//   - a sustained chord PAD (summed sines) for warmth,
//   - a plucked ARPEGGIO that walks the chord tones for melody/movement,
//   - a BASS root note per chord for weight,
// then glued with reverb + a gentle low-pass and loudness-normalised so the
// sidechain ducking in mux.ts behaves the same across every track.
//
// Usage:  node scripts/build-music.mjs            (build all)
//         node scripts/build-music.mjs wonder     (build one)
//
// Requires: sox, ffmpeg on PATH.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'music');

// ---- note frequencies (Hz) ------------------------------------------------
// One octave is enough; we shift by *2 / *0.5 for octaves in the recipes.
const N = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, Bb1: 58.27, Bb2: 116.54,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94, Bb3: 233.08,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, Bb4: 466.16,
  'C#5': 554.37, 'G#4': 415.3, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

// ---- mood recipes ---------------------------------------------------------
// chords: each is { pad:[hz...], bass:hz }. arp walks `pad` (optionally +oct).
// chordDur: seconds per chord. arpDur: seconds per plucked note.
const MOODS = {
  // Lush, open, optimistic — the default for science/explainer topics.
  wonder: {
    chordDur: 2.4, arpDur: 0.6, cycles: 4, reverb: 60, lowpass: 9000,
    padVol: 0.32, arpVol: 0.5, bassVol: 0.45, arpOct: 2,
    chords: [
      { pad: [N.C4, N.E4, N.G4], bass: N.C2 },
      { pad: [N.G4, N.B4, N.D5], bass: N.G2 },
      { pad: [N.A4, N.C5, N.E5], bass: N.A2 },
      { pad: [N.F4, N.A4, N.C5], bass: N.F2 },
    ],
  },
  // Sparse, dark, suspenseful — black holes, unsolved problems, "what if".
  mystery: {
    chordDur: 3.2, arpDur: 1.6, cycles: 3, reverb: 75, lowpass: 6000,
    padVol: 0.34, arpVol: 0.4, bassVol: 0.5, arpOct: 1,
    chords: [
      { pad: [N.A3, N.C4, N.E4], bass: N.A2 },
      { pad: [N.F3, N.A3, N.C4], bass: N.F2 },
      { pad: [N.D3, N.F3, N.A3], bass: N.D2 },
      { pad: [N.E3, N['G#4'], N.B4], bass: N.E2 },
    ],
  },
  // Building, cinematic, weighty — stakes, scale, "this changes everything".
  dramatic: {
    chordDur: 2.0, arpDur: 0.5, cycles: 4, reverb: 55, lowpass: 9000,
    padVol: 0.34, arpVol: 0.48, bassVol: 0.55, arpOct: 2,
    chords: [
      { pad: [N.D4, N.F4, N.A4], bass: N.D2 },
      { pad: [N.Bb3, N.D4, N.F4], bass: N.Bb1 },
      { pad: [N.F4, N.A4, N.C5], bass: N.F2 },
      { pad: [N.A4, N['C#5'], N.E5], bass: N.A2 },
    ],
  },
  // Bright, moving, energetic — product/how-to/reels.
  upbeat: {
    chordDur: 1.6, arpDur: 0.4, cycles: 5, reverb: 38, lowpass: 12000,
    padVol: 0.3, arpVol: 0.55, bassVol: 0.5, arpOct: 2,
    chords: [
      { pad: [N.C4, N.E4, N.G4], bass: N.C3 },
      { pad: [N.G4, N.B4, N.D5], bass: N.G2 },
      { pad: [N.A4, N.C5, N.E5], bass: N.A2 },
      { pad: [N.F4, N.A4, N.C5], bass: N.F2 },
    ],
  },
  // Very soft, warm, slow — meditative/calm explainers, soft intros.
  calm: {
    chordDur: 4.0, arpDur: 2.0, cycles: 2, reverb: 80, lowpass: 5000,
    padVol: 0.36, arpVol: 0.34, bassVol: 0.42, arpOct: 1,
    chords: [
      { pad: [N.F3, N.A3, N.C4], bass: N.F2 },
      { pad: [N.C4, N.E4, N.G4], bass: N.C3 },
      { pad: [N.D3, N.F3, N.A3], bass: N.D2 },
      { pad: [N.Bb2, N.D3, N.F3], bass: N.Bb2 },
    ],
  },
};

function sox(args) {
  execFileSync('sox', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function buildMood(name, work) {
  const m = MOODS[name];
  if (!m) throw new Error(`unknown mood ${name}`);

  const padParts = [];
  const arpParts = [];
  const bassParts = [];
  let idx = 0;

  for (let c = 0; c < m.cycles; c++) {
    for (const chord of m.chords) {
      // PAD: one sustained tone summing the chord's sines, half-sine fades to
      // avoid clicks at chord boundaries.
      const pad = join(work, `pad-${idx}.wav`);
      const synth = ['-n', pad, 'synth', m.chordDur.toFixed(3)];
      for (const f of chord.pad) synth.push('sine', f.toFixed(3));
      // `channels 1` sums the per-oscillator channels into one signal so the
      // chord actually stacks (sox otherwise puts each sine on its own channel).
      synth.push('channels', '1', 'fade', 'h', '0.25', m.chordDur.toFixed(3), '0.25');
      sox(synth);
      padParts.push(pad);

      // BASS: a soft triangle on the root, an octave below the pad.
      const bass = join(work, `bass-${idx}.wav`);
      sox(['-n', bass, 'synth', m.chordDur.toFixed(3), 'triangle', (chord.bass).toFixed(3),
        'fade', 'h', '0.1', m.chordDur.toFixed(3), '0.4']);
      bassParts.push(bass);

      // ARP: plucked notes walking the chord tones (up, then a top note).
      const tones = chord.pad.map((f) => f * m.arpOct);
      const seq = [...tones, tones[tones.length - 1] * 1.5]; // add a 5th-ish sparkle
      const perChord = Math.max(1, Math.round(m.chordDur / m.arpDur));
      for (let k = 0; k < perChord; k++) {
        const f = seq[k % seq.length];
        const note = join(work, `arp-${idx}-${k}.wav`);
        sox(['-n', note, 'synth', m.arpDur.toFixed(3), 'pluck', f.toFixed(3),
          'fade', 'h', '0.005', m.arpDur.toFixed(3), Math.min(0.2, m.arpDur * 0.6).toFixed(3)]);
        arpParts.push(note);
      }
      idx++;
    }
  }

  const padTrack = join(work, 'pad.wav');
  const bassTrack = join(work, 'bass.wav');
  const arpTrack = join(work, 'arp.wav');
  sox([...padParts, padTrack]);
  sox([...bassParts, bassTrack]);
  sox([...arpParts, arpTrack]);

  // Mix the three layers, glue with reverb + low-pass for warmth.
  const mixed = join(work, 'mixed.wav');
  sox([
    '-m',
    '-v', m.padVol.toFixed(3), padTrack,
    '-v', m.bassVol.toFixed(3), bassTrack,
    '-v', m.arpVol.toFixed(3), arpTrack,
    mixed,
    'channels', '2',
    'reverb', String(m.reverb),
    'lowpass', String(m.lowpass),
    'gain', '-n', '-3',
  ]);

  // Loudness-normalise + encode mp3 so every mood ducks identically in mux.ts.
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${name}.mp3`);
  execFileSync(
    'ffmpeg',
    ['-y', '-i', mixed, '-af', 'loudnorm=I=-20:TP=-1.5:LRA=11', '-ar', '44100',
      '-ac', '2', '-b:a', '128k', out],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return out;
}

const only = process.argv[2];
const names = only ? [only] : Object.keys(MOODS);
for (const name of names) {
  const work = mkdtempSync(join(tmpdir(), `cbmusic-${name}-`));
  try {
    const out = buildMood(name, work);
    const dur = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', out]).toString().trim();
    console.log(`built ${name} → ${out} (${Number(dur).toFixed(1)}s)`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
