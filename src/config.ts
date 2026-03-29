import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const REGISTRY_PATH = join(tmpdir(), 'mdzen-registry.json');

interface RegistryEntry {
  port: number;
  pid: number;
  docRoot: string;
}

export function readRegistry(): RegistryEntry[] {
  try {
    const entries: RegistryEntry[] = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
    return entries.filter(e => {
      try { process.kill(e.pid, 0); return true; } catch { return false; }
    });
  } catch {
    return [];
  }
}

function saveRegistry(entries: RegistryEntry[]): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2), 'utf-8');
}

export function findByDocRoot(docRoot: string): RegistryEntry | undefined {
  return readRegistry().find(e => e.docRoot === docRoot);
}

export function registerInstance(port: number, pid: number, docRoot: string): void {
  const entries = readRegistry().filter(e => e.docRoot !== docRoot);
  entries.push({ port, pid, docRoot });
  saveRegistry(entries);
}

export function unregisterInstance(docRoot: string): void {
  const entries = readRegistry().filter(e => e.docRoot !== docRoot);
  saveRegistry(entries);
}

function killEntry(entry: RegistryEntry): void {
  try {
    process.kill(entry.pid, 'SIGTERM');
    console.log(`✅ 已停止 mdzen（端口 ${entry.port}，目录 ${entry.docRoot}）`);
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      console.log(`进程 ${entry.pid} 已不存在，已清理`);
    } else {
      console.error(`停止端口 ${entry.port} 失败:`, err.message);
    }
  }
}

function handleStop(args: string[]): never {
  let port: number | undefined;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
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
    const entry = entries.find(e => e.port === port);
    if (!entry) {
      console.error(`未找到运行在端口 ${port} 的 mdzen 实例`);
      process.exit(1);
    }
    killEntry(entry);
    unregisterInstance(entry.docRoot);
  } else {
    const docRoot = resolve(process.cwd());
    const entry = entries.find(e => e.docRoot === docRoot);
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

function parseArgs(): string {
  const args = process.argv.slice(2);

  if (args[0] === 'stop') {
    handleStop(args.slice(1));
  }

  if (args[0] === 'list') {
    handleList();
  }

  let docRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-d' && args[i + 1]) {
      docRoot = resolve(args[i + 1]!);
      i++;
    } else if (args[i] === '-p' && args[i + 1]) {
      const port = parseInt(args[i + 1]!, 10);
      if (!isNaN(port)) {
        process.env.MD_PREVIEW_PORT = port.toString();
      }
      i++;
    } else if (args[i] === '-h' || args[i] === '--help') {
      console.log(`
用法: mdzen [选项]
       mdzen stop [-p 端口]
       mdzen list

选项:
  -d <路径>    指定文档根目录（绝对路径或相对路径）
  -p <端口>    指定服务端口（默认 3456，端口被占用时自动递增）
  -h, --help   显示帮助信息

子命令:
  stop         停止当前目录的 mdzen 实例
  stop -p 端口  停止指定端口的实例
  stop --all   停止所有 mdzen 实例
  list         查看所有正在运行的 mdzen 实例

示例:
  mdzen -d /path/to/docs
  mdzen -d ./docs -p 8080
  mdzen list
  mdzen stop
  mdzen stop -p 3457
  mdzen stop --all
`);
      process.exit(0);
    }
  }

  if (!existsSync(docRoot)) {
    console.error(`错误: 目录不存在 - ${docRoot}`);
    process.exit(1);
  }

  return docRoot;
}

export const DOC_ROOT: string = parseArgs();
export const PORT: number = parseInt(process.env.MD_PREVIEW_PORT ?? '3456', 10);

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
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};
