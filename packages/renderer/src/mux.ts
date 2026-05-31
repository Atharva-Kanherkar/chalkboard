// Take the silent webm from render.ts plus per-scene audio files, build a
// concatenated audio track with the same scene boundaries, and mux it into a
// final mp4. We rely on the system `ffmpeg` binary — installation instructions
// live in the README.
//
// Strategy:
// 1. For each scene, pad/truncate its audio file so its length matches the
//    scene's `durationMs` (visuals are authoritative).
// 2. Concat all per-scene audios into one wav.
// 3. Mux the concat'd audio into the silent video, transcoding video to h264.

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SceneTiming } from './timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AudioTrack {
  /** Path to the per-scene audio file (any format ffmpeg can read). */
  path: string;
  /** True duration of the audio (ms). Used to know how much silence to pad. */
  durationMs: number;
}

export interface MuxInput {
  silentVideoPath: string;
  /** Aligned to script.scenes. Length must match timings.length. */
  audioTracks: AudioTrack[];
  timings: SceneTiming[];
  outputPath: string;
  /** Temp dir for intermediate files. */
  workDir: string;
  /**
   * Background music. When enabled, a track is looped under the narration and
   * sidechain-ducked so the voice stays clearly legible. Defaults to the
   * bundled CC0 ambient loop; pass `path` for a custom track.
   */
  music?: {
    enabled: boolean;
    path?: string;
    /** Pre-duck music gain, 0..1. Default 0.5. */
    gain?: number;
  };
  onProgress?: (msg: string) => void;
}

/**
 * Resolve a bundled fallback track, looking in both dist/ and src/ layouts.
 * Prefers the mood-matched library (defaulting to "wonder"); falls back to the
 * legacy ambient loop if the library is missing.
 */
export function bundledMusicPath(): string | null {
  const candidates = [
    resolve(__dirname, '../assets/music/wonder.mp3'),
    resolve(__dirname, '../../assets/music/wonder.mp3'),
    resolve(__dirname, '../assets/ambient-loop.mp3'),
    resolve(__dirname, '../../assets/ambient-loop.mp3'),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function muxFinal(input: MuxInput): Promise<string> {
  const { silentVideoPath, audioTracks, timings, outputPath, workDir } = input;
  await mkdir(workDir, { recursive: true });

  // Build per-scene padded audio.
  const padded: string[] = [];
  for (let i = 0; i < timings.length; i++) {
    const target = timings[i]!.durationMs / 1000;
    const padFile = join(workDir, `scene-${i}.padded.wav`);
    const track = audioTracks[i];
    if (track && track.durationMs > 0) {
      await padOrTrim(track.path, target, padFile);
    } else {
      await silentWav(target, padFile);
    }
    padded.push(padFile);
  }

  // Concat list file for ffmpeg.
  const listFile = join(workDir, 'audio-list.txt');
  await writeFile(
    listFile,
    padded.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  );

  const combinedAudio = join(workDir, 'combined.wav');
  await runFfmpeg(
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', combinedAudio],
    input.onProgress,
  );

  // Resolve background music, if enabled. Falls back to the bundled loop.
  let musicPath: string | null = null;
  if (input.music?.enabled) {
    musicPath = input.music.path ?? bundledMusicPath();
    if (!musicPath || !existsSync(musicPath)) {
      input.onProgress?.('background music requested but no track found — skipping');
      musicPath = null;
    }
  }

  // Final mux. Re-encode video to h264 for portability; audio to aac.
  // (Captions are drawn onto the canvas during render, so nothing to burn here.)
  const videoOut = [
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    '-movflags',
    '+faststart',
    outputPath,
  ];

  if (musicPath) {
    // Loop the music (-stream_loop) under the voice. sidechaincompress ducks
    // the music whenever the voice is present; amix(normalize=0) keeps the
    // voice at full level; alimiter guards against the summed peak clipping.
    // afade gives the bed a gentle intro swell and a graceful tail-out so it
    // doesn't start/stop abruptly.
    const gain = clamp01(input.music?.gain ?? 0.45);
    const totalSec = timings.reduce((s, t) => s + t.durationMs, 0) / 1000;
    const fadeOutStart = Math.max(0, totalSec - 2.5).toFixed(3);
    const filter =
      `[2:a]volume=${gain.toFixed(3)},aformat=sample_rates=44100:channel_layouts=stereo,` +
      `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2.5[mraw];` +
      `[mraw][1:a]sidechaincompress=threshold=0.03:ratio=6:attack=10:release=350[mduck];` +
      `[1:a][mduck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`;
    input.onProgress?.('mixing background music (ducked under narration)');
    await runFfmpeg(
      [
        '-y',
        '-i',
        silentVideoPath,
        '-i',
        combinedAudio,
        '-stream_loop',
        '-1',
        '-i',
        musicPath,
        '-filter_complex',
        filter,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        ...videoOut,
      ],
      input.onProgress,
    );
  } else {
    await runFfmpeg(
      ['-y', '-i', silentVideoPath, '-i', combinedAudio, ...videoOut],
      input.onProgress,
    );
  }

  return outputPath;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

async function padOrTrim(input: string, targetSec: number, output: string): Promise<void> {
  // apad pads with silence to keep ≥ target; -t trims to exactly target.
  await runFfmpeg([
    '-y',
    '-i',
    input,
    '-af',
    `apad,atrim=0:${targetSec.toFixed(3)}`,
    '-ar',
    '44100',
    '-ac',
    '2',
    output,
  ]);
}

async function silentWav(durationSec: number, output: string): Promise<void> {
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-t',
    durationSec.toFixed(3),
    output,
  ]);
}

function runFfmpeg(args: string[], onProgress?: (msg: string) => void): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stderr: string[] = [];
    child.stderr.on('data', (d: Buffer) => {
      const line = d.toString('utf8');
      stderr.push(line);
      // ffmpeg emits progress on stderr; surface concise frames=... lines.
      if (onProgress && /frame=|size=/.test(line)) onProgress(line.trim().split('\n').pop() || '');
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg exited ${code}: ${stderr.join('').slice(-1000)}`));
    });
  });
}

/** Probe an audio file for its duration in ms via ffprobe. */
export function probeAudioDuration(path: string): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        path,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on('data', (d: Buffer) => out.push(d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => err.push(d.toString('utf8')));
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`ffprobe exited ${code}: ${err.join('')}`));
        return;
      }
      const seconds = Number.parseFloat(out.join('').trim());
      if (!Number.isFinite(seconds)) {
        rejectPromise(new Error(`ffprobe: could not parse duration from "${out.join('')}"`));
        return;
      }
      resolvePromise(Math.round(seconds * 1000));
    });
  });
}
