# Glossary

> Terms that mean different things in different files. Read this before using them.

## profile vs userProfile vs personality

These three look similar and mean different things:

- **`profile` / `PetProfile`** — Defines **HER** (the pet). Loaded from `pets/*.md` frontmatter. Includes name, relationship, tone, forbid words, and the SOUL body. Hand-written, immutable.
- **`userProfile`** — A short rolling description of **HIM** (the user). Lives in `memory.json` as one ≤200-char string. LLM-updated by the memory updater.
- **`PersonalityConfig`** — **deleted in M1.2b**. Was a partial of profile fields. Don't use it.

If you see "profile" in code: it's about her. "userProfile": about him.

## SOUL vs acquired vs memory

Three layers of who she is and what she knows. **They cannot conflict — order resolves it**:

- **SOUL** (`profile.soul`) — Who she is. Hand-written. The LLM never modifies it. Positionally first in every system prompt.
- **acquired** (`acquired.json`) — Small habits/preferences/beliefs she's grown into through interaction. LLM-evolved with confidence × 0.95 decay. Can never contradict SOUL (rule encoded in prompt).
- **memory** (`memory.json`) — What she knows about the user: `userProfile` + `facts[]` + `episodes[]`.

## episode

A psych-flavored term, not a TV episode. One emotional moment between her and him, with three fields:

```ts
{
  ts: number,
  gist: string,        // ≤60 chars, what happened
  herFeeling: string,  // ≤30 chars, how she felt about it
  userTone?: ...,      // optional read on his state
}
```

**Episodes are append-only**. The memory-updater can add. The dream pass reads but never modifies them. Cap MAX_EPISODES = 10, oldest dropped on overflow.

## fact

Knowledge-shaped information about the user, ≤30 chars, third-person. "他养了一只橘猫", "他在写 markdown 工具". LLM-managed via 4-op patches (ADD / UPDATE / DELETE / NOOP). Cap 8.

## acquired trait

A habit / preference / relation_belief × confidence. First-person, ≤60 chars. Examples:

- (habit) "我跟他聊代码时会慢一点"
- (preference) "我喜欢留心傍晚的事"
- (relation_belief) "他不愿意承认压力"

Confidence 0..1. Initial 0.5 (extractor) or 0.7 (dream promote). Decays × 0.95 per dream. Drops below 0.2 → auto-removed. Per-category cap 4.

## inner_thought vs contextual phrase vs zone phrase

Three near-synonyms that do different jobs:

- **inner_thought** (`inner-thought.json`) — She has an interior monologue this hour. LLM-generated based on rhythm phase + recent episodes + (optionally) last night's dream. Surfaces as `【她此刻心境】` in prompts.
- **contextual phrase** (`emotion.contextualPhrase`) — A short phrase describing how she feels about recent events. Refreshed when emotion zone changes or after 2h. Surfaces as `【此刻心境】`.
- **zone phrase** (`PRESET_PHRASES[zone]`) — Static phrase for the affection zone (adored / friendly / sulky / cold / hiding). Computed, not LLM-generated. Surfaces as `【基础情绪】`.

All three appear adjacent in the system prompt. They feed the LLM different facets of the same vibe.

## presence

Cross-restart "when did I last see him". Not the same as a session — sessions count as new only after a 4h gap. `presence.json` holds:

```ts
{
  lastSeenAt: number,
  lastSeenPhase: DayPhase,
  sessionsCount: number,    // total over time
  firstSeenAt: number,      // first ever interaction
}
```

The `lastSeenLine` formatter renders this in natural language ("你刚回来了" / "今天还没见过你" / "3 天没见到你了").

## rhythm phase

Time-of-day classifier with 7 phases:

| phase | hours | flavor |
|---|---|---|
| dawn | 5-6 | sleepy, just waking |
| morning | 7-10 | alert, fresh |
| noon | 11-12 | slowing, lunchy |
| afternoon | 13-16 | steady, slightly drowsy |
| evening | 17-19 | relaxed, social |
| night | 20-22 | gentle, wind-down |
| lateNight | 23-4 | quiet, intimate |

Each phase has a `baseMood`, `energyLevel`, `dialogueTendency`, `innerThought` baseline. Used to bias the proactive loop, the inner-thought generator, and the dream gate (lateNight only).

## dream

Sleep-time memory consolidation. Inspired by Park et al. 2023 + Anthropic Claude Code Auto Dream pattern. Fires at most once / 24h, only in lateNight phase, only when ≥5 new episodes since last dream + user idle ≥30min. See `ARCHITECTURE.md` "Dream consolidation" for the four phases.

## Storage scopes: global vs workspace

- **global** (`~/.seren/global/*.json`) — relationship layer. One per user/machine. Memory, emotion, presence, inner-thought, acquired, dream-log all live here.
- **workspace** (`~/.seren/workspaces/<sha1>/chat/*.json`) — chat history only. Per markdown folder.

Principle: she has ONE relationship with the user. Workspaces are scenes within it.
