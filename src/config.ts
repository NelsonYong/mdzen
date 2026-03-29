import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

export function pidFilePath(port: number): string {
  return join(tmpdir(), `mdpeek-${port}.pid`);
}

function handleStop(args: string[]): never {
  let port = 3456;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-p' && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10);
      i++;
    }
  }

  const pidFile = pidFilePath(port);
  if (!existsSync(pidFile)) {
    console.error(`未找到运行在端口 ${port} 的 mdpeek 进程`);
    process.exit(1);
  }

  const pid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
    unlinkSync(pidFile);
    console.log(`✅ 已停止 mdpeek（PID ${pid}，端口 ${port}）`);
  } catch (err: any) {
    if (err.code === 'ESRCH') {
      unlinkSync(pidFile);
      console.log(`进程 ${pid} 已不存在，已清理 PID 文件`);
    } else {
      console.error('停止失败:', err.message);
      process.exit(1);
    }
  }
  process.exit(0);
}

function parseArgs(): string {
  const args = process.argv.slice(2);

  if (args[0] === 'stop') {
    handleStop(args.slice(1));
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
用法: mdpeek [选项]
       mdpeek stop [-p 端口]

选项:
  -d <路径>    指定文档根目录（绝对路径或相对路径）
  -p <端口>    指定服务端口（默认 3456）
  -h, --help   显示帮助信息

子命令:
  stop         停止正在运行的服务（默认端口 3456）
  stop -p 8080 停止指定端口的服务

示例:
  mdpeek -d /path/to/docs
  mdpeek -d ./docs -p 8080
  mdpeek stop
  mdpeek stop -p 8080
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
