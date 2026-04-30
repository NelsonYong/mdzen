import { resolve, sep } from 'node:path';
import { realpathSync } from 'node:fs';

export class PathTraversalError extends Error {
  readonly userPath: string;
  constructor(userPath: string) {
    super(`Path traversal attempt: ${userPath}`);
    this.name = 'PathTraversalError';
    this.userPath = userPath;
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RAW_MARKER = Symbol('raw-html');

export interface RawHtml {
  readonly [RAW_MARKER]: true;
  readonly value: string;
}

export function raw(value: string): RawHtml {
  return { [RAW_MARKER]: true, value };
}

export function isRaw(value: unknown): value is RawHtml {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [RAW_MARKER]?: unknown })[RAW_MARKER] === true
  );
}

export type Interpolatable =
  | string
  | number
  | boolean
  | null
  | undefined
  | RawHtml
  | readonly Interpolatable[];

function interpolate(value: Interpolatable): string {
  if (value == null || value === false || value === true) return '';
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number') return String(value);
  if (isRaw(value)) return value.value;
  if (Array.isArray(value)) return value.map((v) => interpolate(v as Interpolatable)).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Interpolatable[]): string {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]!);
    out += strings[i + 1]!;
  }
  return out;
}

export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/-->/g, '--\\>')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

let cachedRealRoot: { input: string; real: string } | null = null;

function realRootOf(root: string): string {
  if (cachedRealRoot && cachedRealRoot.input === root) return cachedRealRoot.real;
  const real = realpathSync(root);
  cachedRealRoot = { input: root, real };
  return real;
}

export function safeResolve(root: string, userPath: string): string {
  const cleaned = userPath.replace(/\0/g, '');
  const resolved = resolve(root, cleaned);
  if (!resolved.startsWith(root + sep) && resolved !== root) {
    throw new PathTraversalError(userPath);
  }
  try {
    const real = realpathSync(resolved);
    const realRoot = realRootOf(root);
    if (!real.startsWith(realRoot + sep) && real !== realRoot) {
      throw new PathTraversalError(userPath);
    }
    return real;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved;
    }
    throw err;
  }
}

export function decodeUrlPath(rawUrlPath: string): string | null {
  try {
    const decoded = decodeURIComponent(rawUrlPath);
    if (decoded.includes('\0')) return null;
    return decoded;
  } catch {
    return null;
  }
}
