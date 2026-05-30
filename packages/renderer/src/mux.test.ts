import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { bundledMusicPath } from './mux.js';

describe('bundledMusicPath', () => {
  it('resolves the bundled ambient loop and the file exists', () => {
    const p = bundledMusicPath();
    expect(p).toBeTruthy();
    expect(p!.endsWith('ambient-loop.mp3')).toBe(true);
    expect(existsSync(p!)).toBe(true);
  });
});
