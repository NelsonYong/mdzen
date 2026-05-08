import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute, extname } from 'node:path';

// Persona profile — declarative configuration for who she is.
// Two file formats supported:
//   1. Frontmatter markdown (`---\nyaml\n---\n...soul body...`) — preferred
//   2. JSON ({ name, relationship, ..., soul: '...body...' })
//
// Anyone embedding @mdzen/pet defines their character once in such a file
// and the rest of the system (agent, action-picker, memory) reads from it.

export interface PetProfile {
  name: string;
  /** lover | pet | friend | sister | mentor — or any free-form string. */
  relationship: string;
  pronounSelf: string;
  pronounUser: string;
  /** Words/phrases the pet must NOT use (passed to LLM as a hard rule). */
  forbid: string[];
  /** Free-form tone descriptor injected into the system prompt. */
  tone: string;
  emojiPolicy: 'none' | 'sparing' | 'liberal';
  responseLength: 'short' | 'medium';
  /** The soul body — narrative description of who she is. */
  soul: string;
}

const MAX_SOUL_CHARS = 8000;

export interface ProfileLoadOpts {
  /** Inline soul text. Overrides everything else. */
  soul?: string;
  /** Path to a profile file (.md with frontmatter, or .json). */
  profilePath?: string;
  /** Legacy alias: just the soul body, no metadata. */
  soulPath?: string;
  /** Built-in preset name ('lover' | 'pet' | 'friend' | 'sister'). */
  preset?: string;
  workspaceRoot: string;
  /** Defaults applied when fields missing in the loaded profile. */
  defaults: PetProfile;
}

export async function loadProfile(opts: ProfileLoadOpts): Promise<PetProfile> {
  // Priority: inline soul > profilePath file > soulPath file > preset > defaults
  if (opts.soul) {
    return { ...opts.defaults, soul: clip(opts.soul) };
  }

  if (opts.profilePath) {
    const target = resolveTarget(opts.profilePath, opts.workspaceRoot);
    const parsed = await tryParseProfileFile(target);
    if (parsed) return mergeProfile(opts.defaults, parsed);
    // fall through to legacy paths
  }

  if (opts.soulPath) {
    const target = resolveTarget(opts.soulPath, opts.workspaceRoot);
    try {
      const raw = await readFile(target, 'utf-8');
      return { ...opts.defaults, soul: clip(raw) };
    } catch {
      // fall through
    }
  }

  return { ...opts.defaults };
}

/**
 * Pure parser — exposed for tests + JSON profile lookup.
 * Returns null if the input is unparseable.
 */
export function parseProfileMarkdown(raw: string): Partial<PetProfile> | null {
  // Recognize a leading `---\n...\n---\n` frontmatter block.
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
  if (!m) {
    // No frontmatter — treat the whole thing as soul body.
    return { soul: clip(raw) };
  }
  const [, fm, body] = m;
  const meta = parseSimpleYaml(fm ?? '');
  const out: Partial<PetProfile> = { soul: clip(body ?? '') };
  if (typeof meta.name === 'string') out.name = meta.name;
  if (typeof meta.relationship === 'string') out.relationship = meta.relationship;
  if (typeof meta.pronoun_self === 'string') out.pronounSelf = meta.pronoun_self;
  if (typeof meta.pronoun_user === 'string') out.pronounUser = meta.pronoun_user;
  if (typeof meta.tone === 'string') out.tone = meta.tone;
  if (
    meta.emoji_policy === 'none' ||
    meta.emoji_policy === 'sparing' ||
    meta.emoji_policy === 'liberal'
  ) {
    out.emojiPolicy = meta.emoji_policy;
  }
  if (meta.response_length === 'short' || meta.response_length === 'medium') {
    out.responseLength = meta.response_length;
  }
  if (Array.isArray(meta.forbid)) {
    out.forbid = meta.forbid.filter((s): s is string => typeof s === 'string');
  }
  return out;
}

export function parseProfileJson(raw: string): Partial<PetProfile> | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<PetProfile> = {};
    if (typeof o.name === 'string') out.name = o.name;
    if (typeof o.relationship === 'string') out.relationship = o.relationship;
    if (typeof o.pronounSelf === 'string') out.pronounSelf = o.pronounSelf;
    if (typeof o.pronounUser === 'string') out.pronounUser = o.pronounUser;
    if (typeof o.tone === 'string') out.tone = o.tone;
    if (typeof o.soul === 'string') out.soul = clip(o.soul);
    if (
      o.emojiPolicy === 'none' ||
      o.emojiPolicy === 'sparing' ||
      o.emojiPolicy === 'liberal'
    ) {
      out.emojiPolicy = o.emojiPolicy;
    }
    if (o.responseLength === 'short' || o.responseLength === 'medium') {
      out.responseLength = o.responseLength;
    }
    if (Array.isArray(o.forbid)) {
      out.forbid = o.forbid.filter((s): s is string => typeof s === 'string');
    }
    return out;
  } catch {
    return null;
  }
}

async function tryParseProfileFile(target: string): Promise<Partial<PetProfile> | null> {
  try {
    const raw = await readFile(target, 'utf-8');
    if (extname(target).toLowerCase() === '.json') return parseProfileJson(raw);
    return parseProfileMarkdown(raw);
  } catch {
    return null;
  }
}

function mergeProfile(defaults: PetProfile, p: Partial<PetProfile>): PetProfile {
  return {
    name: p.name ?? defaults.name,
    relationship: p.relationship ?? defaults.relationship,
    pronounSelf: p.pronounSelf ?? defaults.pronounSelf,
    pronounUser: p.pronounUser ?? defaults.pronounUser,
    forbid: p.forbid ?? defaults.forbid,
    tone: p.tone ?? defaults.tone,
    emojiPolicy: p.emojiPolicy ?? defaults.emojiPolicy,
    responseLength: p.responseLength ?? defaults.responseLength,
    soul: p.soul ? clip(p.soul) : defaults.soul,
  };
}

function resolveTarget(path: string, root: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

function clip(s: string): string {
  return s.slice(0, MAX_SOUL_CHARS).trim();
}

/**
 * Tiny YAML subset: `key: value`, `key: 'q'`, `key: "q"`, and inline arrays
 * `key: [a, b, c]` or `key: ['a', "b"]`. Comments/blocks/multiline not supported —
 * the profile fields don't need them.
 */
function parseSimpleYaml(src: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const line of src.split('\n')) {
    const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (!key) continue;
    const v = (rawVal ?? '').trim();
    if (!v) continue;
    if (v.startsWith('[') && v.endsWith(']')) {
      out[key] = v
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    } else {
      out[key] = unquote(v);
    }
  }
  return out;
}

function unquote(s: string): string {
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}
