import { statSync } from 'node:fs';
import { join } from 'node:path';

import { DOC_ROOT } from './config.ts';
import { getMdFiles } from './files.ts';
import { notifyClients } from './sse.ts';

export function watchMdFiles(): void {
  let knownFiles = new Set(getMdFiles());
  const fileStats = new Map<string, number>();

  for (const file of knownFiles) {
    try {
      fileStats.set(file, statSync(join(DOC_ROOT, file)).mtimeMs);
    } catch { /* ignore */ }
  }

  setInterval(() => {
    const currentFiles = new Set(getMdFiles());
    let hasStructureChange = false;

    for (const file of currentFiles) {
      if (!knownFiles.has(file)) {
        hasStructureChange = true;
        console.log(`➕ 检测到新文件: ${file}`);
        try {
          fileStats.set(file, statSync(join(DOC_ROOT, file)).mtimeMs);
        } catch { /* ignore */ }
      }
    }

    for (const file of knownFiles) {
      if (!currentFiles.has(file)) {
        hasStructureChange = true;
        console.log(`➖ 检测到文件删除: ${file}`);
        fileStats.delete(file);
      }
    }

    if (hasStructureChange) {
      notifyClients('reload');
      knownFiles = currentFiles;
    }

    for (const file of currentFiles) {
      try {
        const mtime = statSync(join(DOC_ROOT, file)).mtimeMs;
        const lastMtime = fileStats.get(file);

        if (lastMtime !== undefined && mtime > lastMtime) {
          fileStats.set(file, mtime);
          notifyClients('update', { file });
        } else if (lastMtime === undefined) {
          fileStats.set(file, mtime);
        }
      } catch {
        fileStats.delete(file);
      }
    }
  }, 500);

  console.log(`👀 正在监听 ${knownFiles.size} 个 Markdown 文件的变化...`);
}
