import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { bundledMusicPath } from './mux.js';
import { bundledMoodPath, normalizeMood, resolveMusic } from './music.js';

describe('bundledMusicPath', () => {
  it('resolves a bundled fallback track that exists on disk', () => {
    const p = bundledMusicPath();
    expect(p).toBeTruthy();
    expect(p!.endsWith('.mp3')).toBe(true);
    expect(existsSync(p!)).toBe(true);
  });
});

describe('music mood library', () => {
  it('has a real file for every audible mood', () => {
    for (const mood of ['wonder', 'mystery', 'dramatic', 'upbeat', 'calm'] as const) {
      const p = bundledMoodPath(mood);
      expect(p, mood).toBeTruthy();
      expect(existsSync(p!), `${mood} file exists`).toBe(true);
    }
  });

  it('treats "none" as no track', () => {
    expect(bundledMoodPath('none')).toBeNull();
  });

  it('normalizes unknown moods to wonder', () => {
    expect(normalizeMood('banana')).toBe('wonder');
    expect(normalizeMood(undefined)).toBe('wonder');
    expect(normalizeMood('mystery')).toBe('mystery');
  });

  it('returns no track when disabled or mood is none', async () => {
    expect((await resolveMusic({ enabled: false, workDir: '/tmp' })).source).toBe('none');
    const none = await resolveMusic({ enabled: true, mood: 'none', workDir: '/tmp' });
    expect(none.path).toBeNull();
    expect(none.source).toBe('none');
  });

  it('resolves a bundled track for a mood', async () => {
    const r = await resolveMusic({ enabled: true, mood: 'mystery', workDir: '/tmp' });
    expect(r.source).toBe('bundled');
    expect(r.mood).toBe('mystery');
    expect(r.path!.endsWith('mystery.mp3')).toBe(true);
  });
});
