// Piper TTS adapter — calls the `piper` binary as a subprocess. Piper is free,
// MIT-licensed, multilingual, and runs on CPU. It reads text from stdin and
// writes a 22050 Hz mono WAV to stdout when called with `--output_raw`-less
// args.
//
// The user is expected to install Piper themselves (homebrew / apt / release
// binaries) and download a voice model from
// https://github.com/rhasspy/piper/blob/master/VOICES.md
//
// Conventions:
//   - Binary path: $PIPER_BIN or "piper" on PATH.
//   - Model path: $PIPER_MODEL_<LANG> (e.g. PIPER_MODEL_EN), then $PIPER_MODEL,
//     then a built-in default search path under ./piper-models/<lang>.onnx.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SynthesizeInput, SynthesizeOutput, TTSProvider } from './provider.js';

export interface PiperProviderOptions {
  binaryPath?: string;
  modelPath?: string;
}

export class PiperProvider implements TTSProvider {
  readonly name = 'piper';
  private readonly binaryPath: string;
  private readonly explicitModelPath: string | undefined;

  constructor(opts: PiperProviderOptions = {}) {
    this.binaryPath = opts.binaryPath ?? process.env['PIPER_BIN'] ?? 'piper';
    this.explicitModelPath = opts.modelPath;
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeOutput> {
    const modelPath = this.resolveModelPath(input.language);
    if (!modelPath) {
      throw new Error(
        `PiperProvider: no model for language "${input.language}". ` +
          `Set PIPER_MODEL or PIPER_MODEL_${input.language.toUpperCase()} ` +
          `to a downloaded .onnx file. See https://github.com/rhasspy/piper#voices`,
      );
    }
    if (!existsSync(modelPath)) {
      throw new Error(`PiperProvider: model file not found at ${modelPath}`);
    }

    const wav = await runPiper(this.binaryPath, modelPath, input.text);
    return { bytes: wav, format: 'wav', sampleRate: 22050 };
  }

  private resolveModelPath(language: string): string | undefined {
    if (this.explicitModelPath) return resolve(this.explicitModelPath);
    const langKey = language.split('-')[0]?.toUpperCase();
    if (langKey) {
      const langSpecific = process.env[`PIPER_MODEL_${langKey}`];
      if (langSpecific) return resolve(langSpecific);
    }
    const generic = process.env['PIPER_MODEL'];
    if (generic) return resolve(generic);
    const guess = resolve(process.cwd(), `piper-models/${langKey?.toLowerCase()}.onnx`);
    if (existsSync(guess)) return guess;
    return undefined;
  }
}

function runPiper(bin: string, modelPath: string, text: string): Promise<Uint8Array> {
  return new Promise((resolvePromise, reject) => {
    // `--output_file -` writes WAV to stdout.
    const child = spawn(bin, ['--model', modelPath, '--output_file', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk));

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8');
        reject(new Error(`piper exited ${code}: ${stderr}`));
        return;
      }
      resolvePromise(new Uint8Array(Buffer.concat(chunks)));
    });

    child.stdin.write(text);
    child.stdin.end();
  });
}
