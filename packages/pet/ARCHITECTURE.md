# @seren/pet — Architecture

> The mental model. Read this before touching any of the layered subsystems.

`@seren/pet` is a desktop AI companion. The default character is **希莲 (Xilian)**, a 恋人-type pet. The package ships server (Node) + client (esbuild bundle) and currently embeds inside `mdzen` (markdown preview server) as a pilot. The plan is to move to Tauri.

---

## Naming triad

Three distinct names that disagree on purpose. Don't conflate them:

| name | meaning | where it lives |
|---|---|---|
| **`@seren/pet`** | npm package name | `package.json` |
| **`seren`** | runtime / config namespace | `~/.seren/` storage dir, `__SEREN_CONFIG__` global |
| **希莲 / Xilian** | the default character | `xilian-*.gif` assets, default profile name |
| **`mdzen`** | the markdown host | separate package, will fade in importance |

---

## The mental model: five time scales

Pet state is layered by how fast it changes. Each layer has its own store, its own cadence, and its own mutation rules.

```
                  shorter ──────────────────────────────► longer
                  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ ┌─────────┐
state lifetime    │ now  │ │today │ │days  │ │ weeks  │ │ forever │
                  └──────┘ └──────┘ └──────┘ └────────┘ └─────────┘
state name        currentDoc  emotion   memory    acquired   SOUL
                  selection   presence  episodes  +dream    profile
                  rhythm      inner-    facts                .md
                              thought
mutability        per-request runtime   LLM-wr    LLM-wr     hand-
                                        4-op      slow-       written
                                                  4-op +      immutable
                                                  dream
```

1. **Realtime** — `currentDoc`, `selection`, `rhythm.phase`. Computed per-request, never stored. Every chat reload reads fresh.
2. **Today** — `emotion` (affection/mood), `presence` (lastSeenAt), `inner-thought`. Process-resident or freshly hourly. Persisted across restarts but volatile by purpose.
3. **Days** — `memory.userProfile`, `memory.facts[]`, `memory.episodes[]`. LLM-updated via 4-op patches every 30 min.
4. **Weeks** — `acquired.traits[]` (habits / preferences / relation_belief × confidence). LLM-evolved via 4-op patches every 60 min, plus dream pass nightly. **Episodes are append-only emotional ground truth — dream reads but never rewrites them.**
5. **Forever** — `profile.soul` (the SOUL.md body). Hand-written. Never touched by LLM.

The architecture decision behind this: **she has ONE relationship with the user across every workspace**. Conversations are workspace-scoped (so different topics stay distinct), but the *relationship layer* is global.

---

## Storage layout

```
~/.seren/
  ├── global/                     ← relationship-scoped (one per user/machine)
  │   ├── memory.json             userProfile + facts + episodes
  │   ├── emotion.json            affection / mood
  │   ├── presence.json           lastSeenAt + sessionsCount + firstSeenAt
  │   ├── inner-thought.json      current vibe (with phase)
  │   ├── acquired.json           habits/prefs/beliefs × confidence
  │   ├── dream-log.json          most recent N dream entries + dreamedThru
  │   └── dream.lock              held while dream pass runs
  │
  └── workspaces/<sha1(workspaceRoot)>/
      └── chat/<sessionId>.json   ← workspace + session-scoped chat history
```

**Why this split**: when you switch from `~/code` to `~/notes`, she still knows you have a cat (global), but the conversation about API design stays separate from the conversation about gardening (workspace).

`migrate.ts` runs once on startup to lift v1 per-workspace data into `global/`. Picks the most recently modified workspace as canonical (this is debatable — see TODO §3).

All stores share `createJsonStore<T>` from `json-store.ts`. Atomic writes (temp + rename), `validate(parsed) → T | null` schema-driven coercion, optional thunked `empty` for time-dependent defaults.

---

## System prompt assembly (load-bearing)

Every chat reply assembles a system prompt in this exact order. The order is the contract — see `assembleSystemPrompt()` in `agent.ts` for the canonical implementation, and `agent-prompt.test.ts` for the snapshot tests that lock it down.

```
1.  SOUL                  profile.soul, never overridden by LLM
2.  behavior rules        relation, forbid, tone, length, emoji policy
3.  【上次见到他】         presence.lastSeenAt — natural language gap
4.  【她此刻心境】         inner-thought OR rhythm fallback
5.  【你逐渐学到的...】    acquired (filtered by confidence ≥ 0.4)
6.  【基础情绪】           emotion zone phrase
7.  【此刻心境】           emotion.contextualPhrase
8.  【用户当前在看】        currentDoc per-request
9.  【关于这位用户的概要】 memory.userProfile
10. 【你记得的关于这位用户的事】 memory.facts
11. 【最近的几段共同记忆】 memory.episodes (last 2)
12. (every 8 turns)       SOUL re-injection — combats persona drift
```

**Invariants**:
- SOUL is positionally first and immutable.
- Acquired layer comes AFTER SOUL+behavior, BEFORE memory — it shapes how facts are framed but cannot override identity.
- Re-injection at turn % 8 == 0 fights the documented persona drift at 8-12 turns (Park et al. 2023 + EMNLP 2025 followup).

---

## Cooldown ladder

Every LLM-driven background job has its own cadence. Independently chosen for what each kind of state should naturally update at:

| subsystem | LLM call | cooldown | gate | file |
|---|---|---|---|---|
| **memory updater** | 4-op (ADD/UPDATE/DELETE/NOOP) on facts + optional episode | 30 min | ≥3 turns | `memory-updater.ts` |
| **acquired extractor** | 4-op (ADD/REINFORCE/CONTRADICT/NOOP) on traits | 60 min | ≥6 turns | `acquired-extractor.ts` |
| **inner-thought refresh** | one-line text | 60 min OR phase-change | every chat | `inner-thought.ts` |
| **contextual phrase** | one-line text | 2h OR zone-change | every chat | `contextual.ts` |
| **action picker** | per-reply animation pick | every chat (post-reply) | `llmActions: true` | `action-picker.ts` |
| **proactive speech** | should-speak + text | min 90 min between, 30 min tick | dialogueTendency × random | `proactive.ts` |
| **dream consolidation** | reflect + ops | ≥24h since last + lateNight + idle 30min + ≥5 new episodes | composite gate | `dream.ts` |

Cost budget: the average chat triggers maybe 1-2 background LLM calls (most are gated). Dream is one extra call per night. Total ~$0.01-0.05/day with `gpt-4o-mini`.

---

## The four LLM extractor sites

All six LLM-driven extractors go through `runJsonExtractor<T>` or `runTextExtractor` from `json-extractor.ts`. Each callsite supplies:

- **`system`**: the full prompt body
- **`user`**: trigger message (often "请输出" / "决定" / etc.)
- **`validate`**: shape coercion `(unknown) => T | null` — failure is silent

The extractor handles: LLM construction, `<think>` block stripping (reasoning models), JSON parsing, timeout race, error swallowing.

**Failure modes are unified**: any of (network, parse, validate, timeout) → `null`. Caller decides what to do — usually "no-op the update".

---

## Dream consolidation (sleep-time memory)

Inspired by Park et al. 2023 reflection mechanism + Anthropic Claude Code Auto Dream pattern. Four phases:

1. **Orient** — load state, compute new episodes since last dream
2. **Reflect** — Park-style two-step prompt: questions → insights with episode-index citations
3. **Consolidate** — tool-call ops with **mandatory citations**:
   - `promote_to_acquired` (≥1 cited episode required)
   - `update_user_profile`
   - `merge_facts`
   - `forget_fact`
   - `NOOP` (most common)
4. **Decay & Index** — confidence × 0.95, append entry, set `dreamedThruEpisodeCount`

**Hard rules** (encoded in prompt + applier):
- Episodes are NEVER rewritten by dream — they are emotional ground truth
- Every insight must cite ≥1 episode index (no citation → reject)
- Acquired traits cannot contradict SOUL
- Lock file prevents concurrent dreams across processes

The dream entry is persisted in `dream-log.json` (last 5 dreams kept) and surfaces in `inner-thought` the next morning as a "dream echo" — she wakes up with the night's reflection coloring her mood.

---

## Module organization

```
src/
├── shared/             types + utilities used by both server and client
│   ├── types.ts        CreatePetOptions, FsmState, Boundary, AnimationExtension
│   ├── animations.ts   AnimationDef + registry
│   ├── rhythm.ts       7-phase day computation
│   └── strip-think.ts  <think>...</think> stripper
│
├── server/             Node-only, runs LLM
│   ├── (abstractions)
│   ├──   json-store.ts       generic createJsonStore<T>
│   ├──   json-extractor.ts   runJsonExtractor<T> / runTextExtractor
│   ├── (state stores)
│   ├──   memory.ts           userProfile + facts + episodes
│   ├──   memory-updater.ts   4-op LLM updater
│   ├──   acquired.ts         evolution layer
│   ├──   acquired-extractor.ts
│   ├──   emotion-storage.ts  + emotion.ts (logic)
│   ├──   presence.ts         lastSeenAt + session counting
│   ├──   inner-thought.ts    + maybeRefreshInnerThought
│   ├──   dream.ts            sleep-time consolidation
│   ├──   dream-log.ts        + lock
│   ├──   storage.ts          chat history (workspace-scoped)
│   ├──   migrate.ts          v1→v2 storage migration
│   ├── (business)
│   ├──   profile.ts          frontmatter / JSON profile loader
│   ├──   profile-presets.ts  4 inline presets
│   ├──   agent.ts            createPetAgent + assembleSystemPrompt
│   ├──   proactive.ts        createProactiveLoop factory
│   ├──   action-picker.ts    per-reply animation
│   ├──   contextual.ts       zone-aware phrase
│   ├──   tools.ts            LLM tools (read_file / search / propose_edit)
│   ├──   proposals.ts        propose-edit registry
│   └── (transport)
│       ├── sse.ts            createSseChannels factory
│       └── handler.ts        HTTP routing + buildPet entry
│
└── client/             browser bundle (esbuild)
    ├── index.ts        wires everything
    ├── route-config.ts runtime route prefix
    ├── sprite.ts       GIF sprite + animation registry
    ├── loop.ts         rAF + FSM transitions
    ├── fsm.ts          autonomous state machine
    ├── motion.ts       step physics
    ├── boundary.ts     screen rect
    ├── pet-speech.ts   ack → think → stream → finalize
    ├── sse-consumer.ts SSE client
    ├── bubble.ts       speech bubble
    ├── markdown-tiny.ts ~120 LOC inline markdown
    ├── reader-panel.ts long-reply scroll panel
    ├── input-bar.ts    bottom input
    ├── history-modal.ts
    ├── diff-modal.ts   propose-edit
    ├── emotion-client.ts client emotion mirror
    ├── signal.ts       30s heartbeat
    ├── presets.ts / lines.ts utterance presets
    ├── cooldown.ts     trigger throttle
    ├── busy.ts         global busy flag
    ├── drag.ts / drag-log.ts
    ├── mischief.ts     autonomous mischief
    ├── peek-dodge.ts
    └── triggers/       selection / copy / idle / ceremonial
```

**Dependency direction** (no cycles):

```
shared/  ←─────────  client/
  ▲                    ▲
  │                    │ (via __SEREN_CONFIG__ + SSE only — no direct imports)
  │                    │
  └─────  server/  ────┘
```

---

## Singletons-free architecture

Earlier versions had module-level state in `sse.ts` (channels map) and `proactive.ts` (timer / lastSpokenAt / activeSignals). This made:

- Multi-profile in same process impossible
- Test isolation broken
- Tauri sidecar embedding sharing state across pets

Both are now factories:
- `createSseChannels()` returns `{ attach, dispatch, closeAll }`
- `createProactiveLoop(deps)` returns `{ recordSignal, start, stop }`

Each `buildPet()` instance owns its own. `agent.ts` and `proactive.ts` take `dispatch` as a dep instead of importing it.

---

## Public API entry

```ts
import { createPet } from '@seren/pet';

const pet = createPet({
  workspaceRoot: '/Users/me/notes',
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: 'gpt-4o-mini',
  },
  preset: 'lover',                 // or 'pet' / 'friend' / 'sister'
  // profilePath: 'pets/my-girl.md',  // override with custom
  // extraAnimations: [...],          // host-provided GIFs
});

// Mount HTTP routes:
app.use((req, res, next) => {
  if (pet.matches(req)) return pet.handle(req, res);
  next();
});

// Inject script tag into HTML pages:
const html = `<head>${pet.scriptTag()}</head>...`;
```

See `PROFILE.md` for the profile file format and `pets/*.md` for examples.

---

## Where to look first when

| question | start at |
|---|---|
| how is the system prompt built? | `assembleSystemPrompt()` in `agent.ts` + `agent-prompt.test.ts` |
| how does she remember things? | this file's "5 time scales" + `memory.ts` + `acquired.ts` + `dream.ts` |
| why does she dream? | `dream.ts` header + this file's "Dream consolidation" section |
| how does an HTTP request flow? | `handler.ts:handle()` → `agent.run()` |
| how is global vs workspace decided? | this file's "Storage layout" section |
| how do I add a new background job? | add to `dispatchPostReplyJobs()` in `agent.ts` |
| how do I add a new LLM extractor? | use `runJsonExtractor` from `json-extractor.ts` |
| how do I add a new persistent state? | use `createJsonStore<T>` from `json-store.ts` |
| how do I add a new HTTP route? | add to `matches()` + `handle()` in `handler.ts` |
| how do I add a new SSE event? | extend `PetEvent` union in `sse.ts` + `sse-consumer.ts` switch |
