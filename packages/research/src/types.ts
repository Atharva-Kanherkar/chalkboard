// The output contract of a research run: a CitedBrief. Downstream, the script
// engine (ScriptDoc v2) reads `findings` for narrative material and `sources`
// for the citation table, and each script claim points back at source ids.

/** A retrievable source the research actually consulted. */
export interface Source {
  /** Stable id within a brief, e.g. "s1". */
  id: string;
  url: string;
  title?: string;
  publisher?: string;
  /** A short supporting excerpt, when available. */
  quote?: string;
}

/** A researched claim/insight, grounded by zero or more sources. */
export interface Finding {
  text: string;
  /** Source ids backing this finding. Empty only for ungrounded providers. */
  cites: string[];
}

export interface CitedBrief {
  topic: string;
  /** A short overview of what the research found. */
  summary: string;
  findings: Finding[];
  sources: Source[];
  /**
   * True when findings are backed by retrieved, real sources. The default
   * `openai-deep-research` provider is grounded; the `basic` fallback (LLM
   * synthesis, no live search) is not, and says so honestly.
   */
  grounded: boolean;
  /** Which provider produced this brief. */
  provider: string;
  model?: string;
  /** Estimated USD spent, when the provider reports token usage. */
  estCostUsd?: number;
}
