import type { TTSProviderConfig } from '@chalkboard/shared';
import { ElevenLabsProvider } from './elevenlabs.js';
import { OpenAITTSProvider } from './openai.js';
import { PiperProvider } from './piper.js';
import type { TTSProvider } from './provider.js';
import { StubTTSProvider } from './stub.js';

export function resolveTTSProvider(config: TTSProviderConfig | undefined): TTSProvider {
  const c = config ?? defaultConfigFromEnv();
  switch (c.kind) {
    case 'piper':
      return new PiperProvider({
        ...(c.binaryPath ? { binaryPath: c.binaryPath } : {}),
        ...(c.modelPath ? { modelPath: c.modelPath } : {}),
      });
    case 'openai':
      return new OpenAITTSProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.model ? { model: c.model } : {}),
        ...(c.voice ? { voice: c.voice } : {}),
      });
    case 'elevenlabs':
      return new ElevenLabsProvider({
        ...(c.apiKey ? { apiKey: c.apiKey } : {}),
        ...(c.voiceId ? { voiceId: c.voiceId } : {}),
      });
    case 'stub':
      return new StubTTSProvider({
        ...(typeof c.msPerChar === 'number' ? { msPerChar: c.msPerChar } : {}),
        ...(typeof c.frequency === 'number' ? { frequency: c.frequency } : {}),
      });
  }
}

function defaultConfigFromEnv(): TTSProviderConfig {
  if (process.env['CHALKBOARD_TTS'] === 'stub') return { kind: 'stub' };
  if (process.env['ELEVENLABS_API_KEY']) return { kind: 'elevenlabs' };
  if (process.env['OPENAI_API_KEY']) return { kind: 'openai' };
  return { kind: 'piper' };
}
