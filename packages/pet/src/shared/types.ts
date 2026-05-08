import type { IncomingMessage, ServerResponse } from 'node:http';

export type FsmState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'running'
  | 'jumping'
  | 'waiting'
  | 'wandering'
  | 'review'
  | 'waving'
  | 'failed';

export interface Boundary {
  selector?: string;
  rect?: { x: number; y: number; w: number; h: number };
  padding?: number;
  exclude?: string[];
}

/** Extension animation (host-provided). Core ids are reserved. */
export interface AnimationExtension {
  id: string;
  assetUrl: string;
  tags?: string[];
  defaultDurationMs?: number;
}

export interface CreatePetOptions {
  workspaceRoot: string;
  llm?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  };
  storage?: { chatDir?: string };
  routePrefix?: string;
  boundary?: Boundary;
  /** Inline soul text. Falls back to bundled default. */
  soul?: string;
  /** Path to a soul.md (legacy: body only, no metadata). */
  soulPath?: string;
  /** Path to a profile file (frontmatter .md or .json). Highest precedence. */
  profilePath?: string;
  /** Built-in preset name: 'lover' | 'pet' | 'friend' | 'sister'. Default 'lover'. */
  preset?: string;
  /** Extra animations available to the LLM action picker + manual setAnimation. */
  extraAnimations?: AnimationExtension[];
  /** Visual / behavior toggles for the embedded client. */
  client?: {
    /** Show the animated GIF sprite at all. Default: true. */
    showSprite?: boolean;
    /** Allow the FSM to autonomously walk/wander. Default: true. */
    autonomousMotion?: boolean;
    /** Let the LLM pick the post-reply animation. Default: true. */
    llmActions?: boolean;
  };
}

export interface Pet {
  matches(req: IncomingMessage): boolean;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  scriptTag(): string;
  close(): Promise<void>;
}

export const ALL_GIFS: ReadonlyArray<string> = [
  'xilian-failed.gif',
  'xilian-idle.gif',
  'xilian-jumping.gif',
  'xilian-review.gif',
  'xilian-running-left.gif',
  'xilian-running-right.gif',
  'xilian-running.gif',
  'xilian-waiting.gif',
  'xilian-waving.gif',
];

export const STATE_TO_GIF: Readonly<Record<FsmState, string>> = {
  'idle': 'xilian-idle.gif',
  'walk-left': 'xilian-running-left.gif',
  'walk-right': 'xilian-running-right.gif',
  'running': 'xilian-running.gif',
  'jumping': 'xilian-jumping.gif',
  'waiting': 'xilian-waiting.gif',
  'wandering': 'xilian-running.gif',
  'review': 'xilian-review.gif',
  'waving': 'xilian-waving.gif',
  'failed': 'xilian-failed.gif',
};
