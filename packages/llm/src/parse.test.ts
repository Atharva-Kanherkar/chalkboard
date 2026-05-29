import { describe, expect, it } from 'vitest';
import { parseSceneScript } from './parse.js';

const validScript = JSON.stringify({
  version: '1',
  meta: { language: 'en', aspectRatio: '16:9' },
  scenes: [{ id: 's1', narration: 'hello', elements: [] }],
});

describe('parseSceneScript', () => {
  it('parses a clean JSON document', () => {
    const s = parseSceneScript(validScript);
    expect(s.version).toBe('1');
    expect(s.scenes.length).toBe(1);
  });

  it('strips markdown fences', () => {
    const wrapped = '```json\n' + validScript + '\n```';
    const s = parseSceneScript(wrapped);
    expect(s.scenes.length).toBe(1);
  });

  it('recovers from prose around JSON', () => {
    const wrapped = `Sure, here you go: ${validScript}\nLet me know!`;
    const s = parseSceneScript(wrapped);
    expect(s.scenes.length).toBe(1);
  });

  it('throws helpful error on non-JSON', () => {
    expect(() => parseSceneScript('no json here at all')).toThrow(/JSON/i);
  });

  it('throws on wrong version', () => {
    expect(() =>
      parseSceneScript(JSON.stringify({ version: '99', meta: {}, scenes: [{}] })),
    ).toThrow(/version/);
  });

  it('throws on missing scenes', () => {
    expect(() =>
      parseSceneScript(JSON.stringify({ version: '1', meta: {}, scenes: [] })),
    ).toThrow(/scenes/);
  });
});
