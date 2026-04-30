import { existsSync, readFileSync, writeFileSync, mkdtempSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REGISTRY_PATH = join(tmpdir(), 'mdzen-registry.json');

interface RegistryEntry {
  port: number;
  pid: number;
  docRoot: string;
}

export type EditorKind = 'cursor' | 'vscode' | 'idea' | 'webstorm' | 'vim' | 'none';

const KNOWN_EDITORS: ReadonlySet<EditorKind> = new Set([
  'cursor',
  'vscode',
  'idea',
  'webstorm',
  'vim',
  'none',
]);

function pkgVersion(): string {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    // Walk up to package.json (works for both src/ and dist/ layouts)
    let dir = here;
    for (let i = 0; i < 5; i++) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as { version?: string };
        if (pkg.version) return pkg.version;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* fall through */
  }
  return '0.0.0';
}

export function readRegistry(): RegistryEntry[] {
  try {
    const entries: RegistryEntry[] = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    return entries.filter((e) => {
      try {
        process.kill(e.pid, 0);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function saveRegistry(entries: RegistryEntry[]): void {
  // Atomic write: temp file + rename. Defeats partial-write races between
  // concurrent mdzen starts on the same machine.
  const dir = dirname(REGISTRY_PATH);
  const tmpDir = mkdtempSync(join(dir, '.mdzen-reg-'));
  const tmpFile = join(tmpDir, 'registry.json');
  try {
    writeFileSync(tmpFile, JSON.stringify(entries, null, 2), 'utf-8');
    renameSync(tmpFile, REGISTRY_PATH);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* may already be moved */
    }
    try {
      rmdirSync(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

export function findByDocRoot(docRoot: string): RegistryEntry | undefined {
  return readRegistry().find((e) => e.docRoot === docRoot);
}

export function registerInstance(port: number, pid: number, docRoot: string): void {
  const entries = readRegistry().filter((e) => e.docRoot !== docRoot);
  entries.push({ port, pid, docRoot });
  saveRegistry(entries);
}

export function unregisterInstance(docRoot: string): void {
  const entries = readRegistry().filter((e) => e.docRoot !== docRoot);
  saveRegistry(entries);
}

function killEntry(entry: RegistryEntry): void {
  try {
    process.kill(entry.pid, 'SIGTERM');
    console.log(`✅ 已停止 mdzen（端口 ${entry.port}，目录 ${entry.docRoot}）`);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      console.log(`进程 ${entry.pid} 已不存在，已清理`);
    } else {
      console.error(`停止端口 ${entry.port} 失败:`, (err as Error).message);
    }
  }
}

function handleStop(args: string[]): never {
  let port: number | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) {
      const parsed = parseInt(args[i + 1]!, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`错误: -p 参数必须是 1-65535 的整数，收到: ${args[i + 1]}`);
        process.exit(1);
      }
      port = parsed;
      i++;
    } else if (args[i] === '--all') {
      all = true;
    }
  }

  const entries = readRegistry();

  if (entries.length === 0) {
    console.log('没有正在运行的 mdzen 实例');
    process.exit(0);
  }

  if (all) {
    for (const entry of entries) killEntry(entry);
    saveRegistry([]);
  } else if (port !== undefined) {
    const entry = entries.find((e) => e.port === port);
    if (!entry) {
      console.error(`未找到运行在端口 ${port} 的 mdzen 实例`);
      process.exit(1);
    }
    killEntry(entry);
    unregisterInstance(entry.docRoot);
  } else {
    const docRoot = resolve(process.cwd());
    const entry = entries.find((e) => e.docRoot === docRoot);
    if (!entry) {
      console.error(`当前目录没有运行中的 mdzen 实例: ${docRoot}`);
      console.log('使用 mdzen list 查看所有实例，或 mdzen stop --all 停止全部');
      process.exit(1);
    }
    killEntry(entry);
    unregisterInstance(entry.docRoot);
  }
  process.exit(0);
}

function handleList(): never {
  const entries = readRegistry();
  if (entries.length === 0) {
    console.log('没有正在运行的 mdzen 实例');
  } else {
    console.log(`\n当前运行的 mdzen 实例 (${entries.length} 个):\n`);
    console.log('  端口\tPID\t目录');
    console.log('  ────\t───\t──────');
    for (const e of entries) {
      console.log(`  ${e.port}\t${e.pid}\t${e.docRoot}`);
    }
    console.log('');
  }
  process.exit(0);
}

interface ParsedArgs {
  docRoot: string;
  editor: EditorKind;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  if (args[0] === 'stop') handleStop(args.slice(1));
  if (args[0] === 'list') handleList();

  if (args.includes('-v') || args.includes('--version')) {
    console.log(pkgVersion());
    process.exit(0);
  }

  let docRoot = process.cwd();
  let editor: EditorKind = 'cursor';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-d' && args[i + 1]) {
      docRoot = resolve(args[i + 1]!);
      i++;
    } else if (a === '-p' && args[i + 1]) {
      const parsed = parseInt(args[i + 1]!, 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`错误: -p 参数必须是 1-65535 的整数，收到: ${args[i + 1]}`);
        process.exit(1);
      }
      process.env['MD_PREVIEW_PORT'] = parsed.toString();
      i++;
    } else if (a === '--editor' && args[i + 1]) {
      const candidate = args[i + 1]!.toLowerCase() as EditorKind;
      if (!KNOWN_EDITORS.has(candidate)) {
        console.error(
          `错误: --editor 取值必须是 ${[...KNOWN_EDITORS].join(' | ')},收到: ${args[i + 1]}`,
        );
        process.exit(1);
      }
      editor = candidate;
      i++;
    } else if (a === '-h' || a === '--help') {
      console.log(`
mdzen ${pkgVersion()} — Fast local Markdown preview server with HMR

用法: mdzen [选项]
       mdzen stop [-p 端口]
       mdzen list

选项:
  -d <路径>          指定文档根目录（绝对路径或相对路径）
  -p <端口>          指定服务端口（默认 3456，端口被占用时自动递增）
  --editor <name>    编辑器跳转目标 (cursor|vscode|idea|webstorm|vim|none，默认 cursor)
  -v, --version      显示版本号
  -h, --help         显示帮助信息

子命令:
  stop               停止当前目录的 mdzen 实例
  stop -p 端口        停止指定端口的实例
  stop --all         停止所有 mdzen 实例
  list               查看所有正在运行的 mdzen 实例

示例:
  mdzen -d /path/to/docs
  mdzen -d ./docs -p 8080 --editor vscode
  mdzen list
  mdzen stop --all
`);
      process.exit(0);
    }
  }

  if (!existsSync(docRoot)) {
    console.error(`错误: 目录不存在 - ${docRoot}`);
    process.exit(1);
  }

  return { docRoot, editor };
}

const parsed = parseArgs();
export const DOC_ROOT: string = parsed.docRoot;
export const EDITOR: EditorKind = parsed.editor;

const envPort = process.env['MD_PREVIEW_PORT'];
const envPortParsed = envPort ? parseInt(envPort, 10) : 3456;
if (envPort && (Number.isNaN(envPortParsed) || envPortParsed < 1 || envPortParsed > 65535)) {
  console.error(`错误: MD_PREVIEW_PORT 必须是 1-65535,收到: ${envPort}`);
  process.exit(1);
}
export const PORT: number = envPortParsed;
export const VERSION: string = pkgVersion();

export const SUPPORTED_EXTENSIONS = ['.md', '.mdc'] as const;
export const EXCLUDED_DIRS = ['node_modules', '.git', '.DS_Store'] as const;
export const ALLOWED_HIDDEN_DIRS = ['.cursor'] as const;

export const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};
