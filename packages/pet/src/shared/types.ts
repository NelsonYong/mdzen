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

export interface PersonalityConfig {
  name: string;
  pronoun: string;
  baseTone: 'gentle-girlish' | 'cool-cat' | string;
  emojiPolicy: 'none' | 'sparing' | 'liberal';
  responseLength: 'short' | 'medium';
}

export interface CreatePetOptions {
  workspaceRoot: string;
  llm?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  };
  storage?: { chatDir?: string };
  personality?: Partial<PersonalityConfig>;
  routePrefix?: string;
  boundary?: Boundary;
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
