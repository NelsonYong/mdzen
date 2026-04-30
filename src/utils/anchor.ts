/**
 * W3C Web Annotation TextQuoteSelector — minimal implementation.
 *
 * An anchor is a triple { exact, prefix, suffix } where `exact` is the selected
 * text and `prefix` / `suffix` are short context windows before/after it.
 * Resolution finds the occurrence in a haystack whose surrounding context best
 * matches the recorded prefix/suffix, so the anchor survives small edits.
 */

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface AnchorMatch {
  start: number;
  end: number;
  score: number;
}

/** Default size of the prefix / suffix context window (chars). */
export const ANCHOR_CONTEXT = 32;

/**
 * Build a TextQuote from a haystack + a (start, end) range inside it.
 */
export function makeTextQuote(
  haystack: string,
  start: number,
  end: number,
  ctxLen: number = ANCHOR_CONTEXT,
): TextQuote {
  const safeStart = Math.max(0, Math.min(start, haystack.length));
  const safeEnd = Math.max(safeStart, Math.min(end, haystack.length));
  return {
    exact: haystack.slice(safeStart, safeEnd),
    prefix: haystack.slice(Math.max(0, safeStart - ctxLen), safeStart),
    suffix: haystack.slice(safeEnd, Math.min(haystack.length, safeEnd + ctxLen)),
  };
}

/**
 * Find every offset where `needle` appears in `haystack`.
 */
function allOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    out.push(idx);
    from = idx + 1;
  }
  return out;
}

/**
 * Count the number of trailing characters of `a` that match the leading chars of `b`,
 * starting from the end of `a` and the start of `b` aligned at a meeting point.
 *
 * Concretely: how many chars of `prefix` match the haystack window that ends just
 * before the candidate occurrence?
 */
function suffixOfAMatchesPrefixOfB(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function prefixOfAMatchesPrefixOfB(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * Resolve a TextQuote anchor to a (start, end) range in `haystack`.
 *
 * Algorithm:
 *   1. Find all exact-match occurrences of `anchor.exact`.
 *   2. For each, score by how many recorded-prefix chars match the haystack chars
 *      immediately before, plus how many recorded-suffix chars match those immediately
 *      after. Tie-break by absolute distance to where the original anchor would have
 *      placed the match (best-effort, here we use the first occurrence as the tie-break
 *      since we have no original-position info).
 *   3. Return the highest-scoring match, or null if no `exact` occurrence exists.
 *
 * Score range:
 *   - 0 = exact text matches but neither prefix nor suffix (still acceptable
 *     when prefix/suffix were empty in the anchor — boundary of the document).
 *   - max = anchor.prefix.length + anchor.suffix.length (perfect surroundings).
 */
export function resolveTextQuote(haystack: string, anchor: TextQuote): AnchorMatch | null {
  const { exact, prefix, suffix } = anchor;
  if (exact.length === 0) return null;

  const occurrences = allOccurrences(haystack, exact);
  if (occurrences.length === 0) return null;

  // Fast path: only one occurrence and no prefix/suffix to disambiguate.
  if (occurrences.length === 1 && prefix.length === 0 && suffix.length === 0) {
    return { start: occurrences[0]!, end: occurrences[0]! + exact.length, score: 0 };
  }

  let best: AnchorMatch | null = null;
  for (const start of occurrences) {
    const end = start + exact.length;
    const before = haystack.slice(Math.max(0, start - prefix.length), start);
    const after = haystack.slice(end, Math.min(haystack.length, end + suffix.length));

    const prefixScore = prefix.length === 0 ? 0 : suffixOfAMatchesPrefixOfB(before, prefix);
    const suffixScore = suffix.length === 0 ? 0 : prefixOfAMatchesPrefixOfB(after, suffix);
    const score = prefixScore + suffixScore;

    if (!best || score > best.score) best = { start, end, score };
  }

  // If we have prefix/suffix info but the best match scored 0, the document changed too much.
  // Reject — caller should treat as orphaned annotation.
  if (best && (prefix.length > 0 || suffix.length > 0) && best.score === 0) return null;
  return best;
}
