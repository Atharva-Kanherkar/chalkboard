// Resolve which background-music track a render should use.
//
// Resolution order (first hit wins):
//   1. an explicit custom file (`--music-track`),
//   2. Jamendo's real catalogue, when `source: 'jamendo'` + a client id is set,
//   3. the bundled, mood-matched CC0 track synthesised by scripts/build-music.mjs,
//   4. nothing (mood 'none' or no track found).
//
// The mood itself is normally chosen by the LLM (it writes the script and knows
// the subject), with an optional override.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSIC_MOODS, type MusicMood } from '@chalkboard/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type { MusicMood };

export type MusicSource = 'custom' | 'bundled' | 'jamendo' | 'none';

export interface ResolveMusicOptions {
  /** Master switch. When false, returns no track. */
  enabled: boolean;
  /** Desired mood; unknown values fall back to 'wonder'. */
  mood?: string;
  /** Explicit track path — always wins when it exists. */
  customPath?: string;
  /** Where to source the track from. 'bundled' (default) or 'jamendo'. */
  source?: 'bundled' | 'jamendo';
  /** Jamendo client id (else read from JAMENDO_CLIENT_ID). */
  jamendoClientId?: string;
  /** Dir to download a fetched track into. */
  workDir: string;
  onProgress?: (msg: string) => void;
}

export interface MusicResolution {
  /** Absolute path to the chosen track, or null for no music. */
  path: string | null;
  mood: MusicMood;
  source: MusicSource;
  /** Required credit line for sourced tracks (e.g. Jamendo CC-BY). */
  attribution?: string;
}

export function normalizeMood(mood?: string): MusicMood {
  if (mood && (MUSIC_MOODS as string[]).includes(mood)) return mood as MusicMood;
  return 'wonder';
}

/** Path to a bundled mood track, searching dist/ and src/ layouts. */
export function bundledMoodPath(mood: MusicMood): string | null {
  if (mood === 'none') return null;
  const candidates = [
    resolve(__dirname, `../assets/music/${mood}.mp3`),
    resolve(__dirname, `../../assets/music/${mood}.mp3`),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function resolveMusic(opts: ResolveMusicOptions): Promise<MusicResolution> {
  const mood = normalizeMood(opts.mood);
  if (!opts.enabled || mood === 'none') {
    return { path: null, mood: 'none', source: 'none' };
  }

  // 1. Explicit custom track always wins.
  if (opts.customPath && existsSync(opts.customPath)) {
    return { path: opts.customPath, mood, source: 'custom' };
  }

  // 2. Jamendo's real catalogue when requested and a key is available.
  if (opts.source === 'jamendo') {
    const clientId = opts.jamendoClientId ?? process.env['JAMENDO_CLIENT_ID'];
    if (clientId) {
      try {
        const j = await fetchJamendoTrack(mood, clientId, opts.workDir, opts.onProgress);
        if (j) return { path: j.path, mood, source: 'jamendo', attribution: j.attribution };
      } catch (err) {
        opts.onProgress?.(
          `jamendo fetch failed (${err instanceof Error ? err.message : String(err)}) — using bundled track`,
        );
      }
    } else {
      opts.onProgress?.('musicSource=jamendo but no JAMENDO_CLIENT_ID set — using bundled track');
    }
  }

  // 3. Bundled mood-matched CC0 track.
  const bundled = bundledMoodPath(mood);
  if (bundled) return { path: bundled, mood, source: 'bundled' };

  // 4. Nothing usable.
  opts.onProgress?.(`no music track found for mood "${mood}" — rendering without music`);
  return { path: null, mood, source: 'none' };
}

// Map our moods onto Jamendo search tags. `fuzzytags` is lenient (OR-ish), so
// these widen the net rather than over-constrain it.
const JAMENDO_TAGS: Record<MusicMood, string> = {
  wonder: 'ambient inspiring',
  mystery: 'dark cinematic',
  dramatic: 'epic cinematic',
  upbeat: 'happy energetic',
  calm: 'calm relaxing',
  none: '',
};

interface JamendoResult {
  path: string;
  attribution: string;
}

/**
 * Fetch a single instrumental track for `mood` from the Jamendo API and
 * download it into `workDir`. Returns the local path + a credit line. Jamendo's
 * free catalogue is Creative Commons, so the attribution must be surfaced.
 */
async function fetchJamendoTrack(
  mood: MusicMood,
  clientId: string,
  workDir: string,
  onProgress?: (msg: string) => void,
): Promise<JamendoResult | null> {
  const url = new URL('https://api.jamendo.com/v3.0/tracks/');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('order', 'popularity_total');
  url.searchParams.set('fuzzytags', JAMENDO_TAGS[mood] || 'instrumental');
  url.searchParams.set('vocalinstrumental', 'instrumental');
  url.searchParams.set('audioformat', 'mp32');
  url.searchParams.set('include', 'musicinfo licenses');

  onProgress?.(`fetching a "${mood}" track from Jamendo`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    headers?: { status?: string; error_message?: string };
    results?: Array<{
      name?: string;
      artist_name?: string;
      audio?: string;
      audiodownload?: string;
      license_ccurl?: string;
      shareurl?: string;
    }>;
  };
  if (body.headers?.status !== 'success') {
    throw new Error(body.headers?.error_message || 'jamendo error');
  }
  const track = body.results?.[0];
  const audioUrl = track?.audiodownload || track?.audio;
  if (!track || !audioUrl) return null;

  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioRes.ok) throw new Error(`download HTTP ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const out = join(workDir, `jamendo-${mood}.mp3`);
  await writeFile(out, buf);

  const credit = `"${track.name}" by ${track.artist_name} (Jamendo${
    track.license_ccurl ? `, ${track.license_ccurl}` : ''
  })`;
  onProgress?.(`music: ${credit}`);
  return { path: out, attribution: credit };
}
