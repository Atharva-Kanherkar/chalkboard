import type { CitedBrief } from './types.js';

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface ResearchInput {
  /** The topic / question to research. */
  topic: string;
  /** How hard to dig. Maps to model + effort per provider. Default 'standard'. */
  depth?: ResearchDepth;
  /** BCP-47 language for the brief. Default 'en'. */
  language?: string;
  onProgress?: (msg: string) => void;
}

export interface ResearchProvider {
  readonly name: string;
  research(input: ResearchInput): Promise<CitedBrief>;
}
