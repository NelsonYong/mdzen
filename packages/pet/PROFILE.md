# Profile File Format

> How to define a custom persona (the SOUL of your pet).

A profile is either:
- **Frontmatter Markdown** (preferred — narrative + metadata together)
- **JSON** (machine-friendly)

Loaded via `CreatePetOptions.profilePath`. See `pets/lover.md` (default), `pets/pet.md`, `pets/friend.md`, `pets/sister.md` for examples to copy.

---

## Frontmatter Markdown

```yaml
---
name: 希莲
relationship: lover
pronoun_self: 我
pronoun_user: 你
forbid: ['亲', '宝贝', '哥哥', '主人']
tone: gentle-girlish
emoji_policy: sparing
response_length: short
---

# 我是希莲

(narrative SOUL body — describes who she is, how she talks, what she won't do)
```

The frontmatter is a tiny YAML subset (key-value lines, single-quoted, double-quoted, or unquoted strings; inline arrays). The body below `---` becomes `profile.soul`.

---

## JSON

```json
{
  "name": "希莲",
  "relationship": "lover",
  "pronounSelf": "我",
  "pronounUser": "你",
  "forbid": ["亲", "宝贝"],
  "tone": "gentle-girlish",
  "emojiPolicy": "sparing",
  "responseLength": "short",
  "soul": "我是希莲...(SOUL body as a string)"
}
```

Note camelCase in JSON (`pronounSelf`) vs snake_case in YAML frontmatter (`pronoun_self`).

---

## Field reference

| field | YAML | JSON | type | default | meaning |
|---|---|---|---|---|---|
| name | `name` | `name` | string | `'希莲'` | character name, surfaces in prompts |
| relationship | `relationship` | `relationship` | string | `'lover'` | `lover` / `pet` / `friend` / `sister` / `mentor` / any free-form string |
| pronoun_self | `pronoun_self` | `pronounSelf` | string | `'我'` | first-person pronoun |
| pronoun_user | `pronoun_user` | `pronounUser` | string | `'你'` | how she addresses the user |
| forbid | `forbid` | `forbid` | string[] | `['亲','宝贝',...]` | words/phrases the LLM must NOT use; injected as a hard rule |
| tone | `tone` | `tone` | string | `'gentle-girlish'` | free-form tone descriptor injected to system prompt |
| emoji_policy | `emoji_policy` | `emojiPolicy` | `'none' \| 'sparing' \| 'liberal'` | `'sparing'` | emoji usage cap |
| response_length | `response_length` | `responseLength` | `'short' \| 'medium'` | `'short'` | default reply length budget |
| soul | (body) | `soul` | string | preset body | the narrative SOUL — full persona description |

**Soul is capped at 8000 chars** (clipped silently on load).

---

## Loading precedence

When you call `createPet({...})`, the profile is resolved in this order — **highest precedence first**:

1. `opts.soul` — inline string. Wins outright. Other fields default to the preset.
2. `opts.profilePath` — file path (frontmatter md OR .json). Loaded fields override the preset.
3. `opts.soulPath` — legacy: just the SOUL body, no metadata. Loads as `soul` only.
4. `opts.preset` — built-in name: `'lover'` (default), `'pet'`, `'friend'`, `'sister'`.
5. Hardcoded fallback (built-in `lover`).

Missing fields in a custom profile fall through to the resolved preset, not to the hardcoded default. So if you specify `profilePath` and your file omits `forbid`, you get the preset's `forbid` list.

---

## Writing your own

Easiest path: copy `pets/lover.md`, change the frontmatter + body, save as `pets/my-girl.md`, then:

```ts
createPet({
  workspaceRoot,
  profilePath: 'pets/my-girl.md',
  llm: { ... },
});
```

Path is resolved relative to `workspaceRoot` (or use an absolute path).

---

## What the SOUL body should and shouldn't do

**Should**:
- Describe who she is in ≤2 paragraphs
- Set rules: how she talks, what she won't do
- Establish tone with examples (1-2 short example utterances)

**Shouldn't**:
- Mention specific tasks ("she helps with code") — that's not identity
- Reference specific platforms ("she lives in markdown") — she'll move to Tauri
- Include numbers — the LLM will read them and try to display them; identity should be qualitative
- Conflict with `forbid` — if you forbid "宝贝" but the SOUL body uses "宝贝", the rule wins but you've confused the model

---

## Validating your profile

Run the tests with your profile temporarily set as default to spot-check:

```bash
pnpm test --filter profile.test.ts
```

There's no schema validator yet (planned). For now, malformed YAML silently produces partial fields.
