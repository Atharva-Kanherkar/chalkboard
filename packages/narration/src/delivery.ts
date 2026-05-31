// Map a provider-agnostic delivery direction (emotion + pace) onto each TTS
// backend's control surface: OpenAI gpt-4o-mini-tts takes a free-text
// `instructions` prompt; ElevenLabs v3 takes inline audio tags.

export interface Delivery {
  emotion?: string;
  pace?: 'slow' | 'normal' | 'fast';
}

/** Build an OpenAI `gpt-4o-mini-tts` instructions string. Undefined if nothing to say. */
export function openAIInstructions(d?: Delivery): string | undefined {
  if (!d || (!d.emotion && !d.pace)) return undefined;
  const parts: string[] = ['Read as a documentary narrator.'];
  if (d.emotion) parts.push(`Tone/emotion: ${d.emotion}.`);
  if (d.pace) {
    parts.push(
      `Pace: ${
        d.pace === 'slow'
          ? 'slow and deliberate, with deliberate pauses'
          : d.pace === 'fast'
            ? 'brisk and energetic'
            : 'natural'
      }.`,
    );
  }
  return parts.join(' ');
}

// Only the documented Eleven v3 audio tags, matched from emotion keywords.
const TAG_RULES: { re: RegExp; tag: string }[] = [
  { re: /\b(whisper|hushed|quiet|secret)\b/, tag: '[whispers]' },
  { re: /\b(excit|thrill|energ|eager|hyped)\b/, tag: '[excited]' },
  { re: /\b(calm|warm|gentle|resolved|sooth|serene|reassur)\b/, tag: '[calm]' },
  { re: /\b(sad|sorrow|somber|melanchol|grief|mourn)\b/, tag: '[sorrowful]' },
  { re: /\b(tense|urgen|anxious|nervous|uneas|dread)\b/, tag: '[nervous]' },
  { re: /\b(frustrat|angry|irritat)\b/, tag: '[frustrated]' },
];

/** Inline audio-tag prefix for ElevenLabs v3 (e.g. "[whispers] "). Empty if no match. */
export function elevenAudioTagPrefix(d?: Delivery): string {
  if (!d?.emotion) return '';
  const e = d.emotion.toLowerCase();
  const tags = TAG_RULES.filter((r) => r.re.test(e)).map((r) => r.tag);
  return tags.length ? `${tags.join(' ')} ` : '';
}
