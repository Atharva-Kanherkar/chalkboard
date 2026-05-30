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
import { join } from 'node:path';
import type { SceneTiming } from './timing.js';

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
  onProgress?: (msg: string) => void;
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

  // Final mux. Re-encode video to h264 for portability; audio to aac.
  // (Captions are drawn onto the canvas during render, so nothing to burn here.)
  await runFfmpeg(
    [
      '-y',
      '-i',
      silentVideoPath,
      '-i',
      combinedAudio,
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
    ],
    input.onProgress,
  );

  return outputPath;
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
