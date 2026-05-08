// Animation registry — replaces the static FsmState→GIF table.
// Core animations are locked (id collision rejected); host can register
// extension animations with custom assets and tags.
//
// `tags` are surfaced to the LLM action picker so it can match an
// emotional context to an appropriate animation by description, not by id.

export type AnimationCategory = 'core' | 'extension';

export interface AnimationDef {
  id: string;
  /**
   * Where to fetch the asset.
   * - bare filename (e.g. 'xilian-idle.gif') → resolved against assetsBase
   * - absolute path (e.g. '/myapp/cute.gif') → used as-is
   * - full URL (e.g. 'https://...') → used as-is
   * - data URL (e.g. 'data:image/gif;base64,...') → used as-is
   */
  assetUrl: string;
  /** Free-form descriptors. The LLM matches emotion ↔ tags. */
  tags: string[];
  /** 0 means hold until explicitly changed (for stateful states like idle/review). */
  defaultDurationMs: number;
  category: AnimationCategory;
}

export const CORE_ANIMATIONS: ReadonlyArray<AnimationDef> = [
  { id: 'idle',       assetUrl: 'xilian-idle.gif',          tags: ['neutral', 'present', 'calm'],         defaultDurationMs: 0,    category: 'core' },
  { id: 'waiting',    assetUrl: 'xilian-waiting.gif',       tags: ['patient', 'pause', 'contemplative'],  defaultDurationMs: 4000, category: 'core' },
  { id: 'review',     assetUrl: 'xilian-review.gif',        tags: ['focused', 'reading', 'thinking'],     defaultDurationMs: 0,    category: 'core' },
  { id: 'jumping',    assetUrl: 'xilian-jumping.gif',       tags: ['happy', 'excited', 'celebrate'],      defaultDurationMs: 1000, category: 'core' },
  { id: 'waving',     assetUrl: 'xilian-waving.gif',        tags: ['greet', 'friendly', 'hello'],         defaultDurationMs: 1500, category: 'core' },
  { id: 'failed',     assetUrl: 'xilian-failed.gif',        tags: ['sad', 'apologetic', 'error'],         defaultDurationMs: 2000, category: 'core' },
  { id: 'walk-left',  assetUrl: 'xilian-running-left.gif',  tags: ['moving', 'leaving'],                  defaultDurationMs: 4000, category: 'core' },
  { id: 'walk-right', assetUrl: 'xilian-running-right.gif', tags: ['moving', 'approaching'],              defaultDurationMs: 4000, category: 'core' },
  { id: 'wandering',  assetUrl: 'xilian-running.gif',       tags: ['exploring', 'restless'],              defaultDurationMs: 8000, category: 'core' },
  { id: 'running',    assetUrl: 'xilian-running.gif',       tags: ['urgent', 'rushing'],                  defaultDurationMs: 1500, category: 'core' },
];

const CORE_IDS = new Set(CORE_ANIMATIONS.map((a) => a.id));

export interface AnimationRegistry {
  list(): ReadonlyArray<AnimationDef>;
  byId(id: string): AnimationDef | undefined;
  /** Throws if id collides with a core animation. Extension only. */
  register(def: Omit<AnimationDef, 'category'>): AnimationDef;
}

export function createAnimationRegistry(extras: ReadonlyArray<Omit<AnimationDef, 'category'>> = []): AnimationRegistry {
  const map = new Map<string, AnimationDef>();
  for (const a of CORE_ANIMATIONS) map.set(a.id, a);

  const register = (def: Omit<AnimationDef, 'category'>): AnimationDef => {
    if (!def.id || typeof def.id !== 'string') throw new Error('animation id required');
    if (CORE_IDS.has(def.id)) {
      throw new Error(`cannot override core animation '${def.id}'`);
    }
    if (!def.assetUrl) throw new Error(`animation '${def.id}' needs assetUrl`);
    const final: AnimationDef = {
      id: def.id,
      assetUrl: def.assetUrl,
      tags: def.tags ?? [],
      defaultDurationMs: def.defaultDurationMs ?? 1500,
      category: 'extension',
    };
    map.set(def.id, final);
    return final;
  };

  for (const e of extras) {
    try {
      register(e);
    } catch {
      // Silently skip bad extras; the warning is an explicit register() call's responsibility.
    }
  }

  return {
    list: () => Array.from(map.values()),
    byId: (id) => map.get(id),
    register,
  };
}

/** True when the asset URL points to a remote/absolute resource, false for bundle-relative. */
export function isExternalAsset(assetUrl: string): boolean {
  return /^(https?:|data:|\/)/.test(assetUrl);
}

/** Resolve an animation's URL against the runtime assetsBase prefix. */
export function resolveAssetUrl(def: AnimationDef, assetsBase: string): string {
  if (isExternalAsset(def.assetUrl)) return def.assetUrl;
  return assetsBase.replace(/\/$/, '') + '/' + def.assetUrl;
}
