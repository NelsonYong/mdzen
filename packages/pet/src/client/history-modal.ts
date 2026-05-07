import { renderMarkdownTiny } from './markdown-tiny.ts';

interface HistoryMessage {
  role: string;
  content: string;
  timestamp: number;
}

const PREFIX = '/api/pet';
const STYLE_ID = 'mdzen-pet-history-styles';

function ensureStylesheet(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.mdzen-pet-history-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 20000;
  display: flex; align-items: center; justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
}
.mdzen-pet-history-card {
  background: #fff;
  width: 600px;
  max-width: 92vw;
  max-height: 80vh;
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.18);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.mdzen-pet-history-header {
  padding: 16px 22px;
  border-bottom: 1px solid #eee;
  display: flex; align-items: center; gap: 10px;
}
.mdzen-pet-history-title {
  flex: 1;
  font-size: 14px; font-weight: 600; color: #333;
}
.mdzen-pet-history-icon-btn {
  width: 30px; height: 30px;
  border: none; background: transparent;
  cursor: pointer;
  border-radius: 8px;
  font-size: 14px; color: #666;
  display: flex; align-items: center; justify-content: center;
  transition: background 120ms ease;
}
.mdzen-pet-history-icon-btn:hover {
  background: rgba(0,0,0,0.06); color: #222;
}
.mdzen-pet-history-icon-btn.danger { color: #c44; }
.mdzen-pet-history-icon-btn.danger:hover { background: rgba(196, 68, 68, 0.08); color: #a23; }

.mdzen-pet-history-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
  display: flex; flex-direction: column;
  gap: 14px;
  font-size: 13px;
  line-height: 1.65;
  color: #222;
}
.mdzen-pet-history-row {
  display: flex; gap: 10px; align-items: flex-start;
}
.mdzen-pet-history-row.user { flex-direction: row-reverse; }
.mdzen-pet-history-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  max-width: 78%;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.mdzen-pet-history-bubble.user {
  background: #eff3ff;
  color: #1e2a5e;
}
.mdzen-pet-history-bubble.assistant {
  background: #fde7f3;
  color: #2c1820;
}
.mdzen-pet-history-bubble.system {
  background: #f5f5f5;
  color: #666;
  font-style: italic;
  align-self: center;
}
.mdzen-pet-history-bubble > *:first-child { margin-top: 0; }
.mdzen-pet-history-bubble > *:last-child { margin-bottom: 0; }
.mdzen-pet-history-bubble p { margin: 0.4em 0; }
.mdzen-pet-history-bubble h1,
.mdzen-pet-history-bubble h2,
.mdzen-pet-history-bubble h3 {
  font-weight: 600; margin: 0.7em 0 0.3em; line-height: 1.35;
}
.mdzen-pet-history-bubble h1 { font-size: 14px; }
.mdzen-pet-history-bubble h2 { font-size: 13.5px; }
.mdzen-pet-history-bubble h3 { font-size: 13px; }
.mdzen-pet-history-bubble ul,
.mdzen-pet-history-bubble ol { padding-left: 1.4em; margin: 0.4em 0; }
.mdzen-pet-history-bubble li { margin: 0.15em 0; }
.mdzen-pet-history-bubble blockquote {
  margin: 0.4em 0;
  padding: 0.2em 0.7em;
  border-left: 2px solid rgba(0,0,0,0.18);
  color: #5a4a55;
  font-style: italic;
  background: rgba(0,0,0,0.03);
}
.mdzen-pet-history-bubble code.mdzen-md-ic {
  background: rgba(0,0,0,0.07);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.mdzen-pet-history-bubble pre.mdzen-md-code {
  background: rgba(0,0,0,0.85);
  color: #f0e8db;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0.5em 0;
}
.mdzen-pet-history-bubble hr {
  border: none;
  border-top: 1px dashed rgba(0,0,0,0.18);
  margin: 0.7em 0;
}
.mdzen-pet-history-meta {
  font-size: 10px; color: #aaa;
  flex-shrink: 0;
  padding-top: 14px;
}
.mdzen-pet-history-empty {
  text-align: center;
  color: #999;
  padding: 50px 0;
  font-style: italic;
}

/* Confirm dialog */
.mdzen-pet-confirm-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 20100;
  display: flex; align-items: center; justify-content: center;
}
.mdzen-pet-confirm-card {
  background: #fff;
  width: 380px; max-width: 90vw;
  border-radius: 12px;
  padding: 20px 22px;
  box-shadow: 0 16px 48px rgba(0,0,0,0.22);
}
.mdzen-pet-confirm-title {
  font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #222;
}
.mdzen-pet-confirm-body {
  font-size: 13px; color: #555; line-height: 1.55; margin-bottom: 12px;
}
.mdzen-pet-confirm-toggle {
  display: flex; align-items: flex-start; gap: 8px;
  background: #faf8f3;
  border: 1px solid #e8e2d0;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  cursor: pointer;
  user-select: none;
}
.mdzen-pet-confirm-toggle input { margin-top: 2px; }
.mdzen-pet-confirm-toggle-label {
  font-size: 12.5px; color: #5e4d36; line-height: 1.5;
}
.mdzen-pet-confirm-toggle-label small { color: #99876b; display: block; margin-top: 3px; }
.mdzen-pet-confirm-actions {
  display: flex; gap: 8px; justify-content: flex-end;
}
.mdzen-pet-confirm-btn {
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
  transition: background 120ms ease;
  font-family: inherit;
}
.mdzen-pet-confirm-btn.cancel {
  background: #f5f5f5; color: #444; border-color: #ddd;
}
.mdzen-pet-confirm-btn.cancel:hover { background: #ececec; }
.mdzen-pet-confirm-btn.danger {
  background: #d05656; color: #fff;
}
.mdzen-pet-confirm-btn.danger:hover { background: #b84747; }
`;
  document.head.appendChild(style);
}

export async function showHistoryModal(sessionId: string): Promise<void> {
  ensureStylesheet();
  let messages = await loadHistory(sessionId);

  const overlay = document.createElement('div');
  overlay.className = 'mdzen-pet-history-overlay';
  const card = document.createElement('div');
  card.className = 'mdzen-pet-history-card';

  const header = document.createElement('div');
  header.className = 'mdzen-pet-history-header';
  const title = document.createElement('div');
  title.className = 'mdzen-pet-history-title';
  const updateTitle = (count: number): void => {
    title.textContent = `聊天历史 · ${count} 条消息`;
  };
  updateTitle(messages.length);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'mdzen-pet-history-icon-btn danger';
  clearBtn.title = '清空记录';
  clearBtn.setAttribute('aria-label', 'clear history');
  clearBtn.textContent = '🗑';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mdzen-pet-history-icon-btn';
  closeBtn.title = '关闭';
  closeBtn.setAttribute('aria-label', 'close');
  closeBtn.textContent = '×';

  header.appendChild(title);
  header.appendChild(clearBtn);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'mdzen-pet-history-body';

  const renderBody = (msgs: HistoryMessage[]): void => {
    body.innerHTML = '';
    if (msgs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'mdzen-pet-history-empty';
      empty.textContent = '还没有聊过什么呢~';
      body.appendChild(empty);
      return;
    }
    for (const m of msgs) {
      const row = document.createElement('div');
      row.className = `mdzen-pet-history-row ${m.role}`;
      const bubble = document.createElement('div');
      bubble.className = `mdzen-pet-history-bubble ${m.role}`;
      const cleaned = stripThinkBlocks(m.content);
      if (m.role === 'assistant' || m.role === 'system') {
        bubble.innerHTML = renderMarkdownTiny(cleaned);
      } else {
        bubble.textContent = cleaned;
      }
      const meta = document.createElement('div');
      meta.className = 'mdzen-pet-history-meta';
      meta.textContent = formatTime(m.timestamp);
      row.appendChild(bubble);
      row.appendChild(meta);
      body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
  };
  renderBody(messages);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const dismiss = (): void => overlay.remove();
  closeBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
  });

  clearBtn.addEventListener('click', () => {
    showConfirmClear(async (alsoMemory) => {
      try {
        await fetch(`${PREFIX}/history?session=${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        if (alsoMemory) {
          await fetch(`${PREFIX}/memory`, { method: 'DELETE' });
        }
      } catch {}
      messages = [];
      updateTitle(0);
      renderBody(messages);
    });
  });
}

async function loadHistory(sessionId: string): Promise<HistoryMessage[]> {
  try {
    const r = await fetch(`${PREFIX}/history?session=${encodeURIComponent(sessionId)}`);
    if (!r.ok) return [];
    return (await r.json()) as HistoryMessage[];
  } catch {
    return [];
  }
}

function showConfirmClear(onConfirm: (alsoMemory: boolean) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'mdzen-pet-confirm-overlay';
  const card = document.createElement('div');
  card.className = 'mdzen-pet-confirm-card';

  const title = document.createElement('div');
  title.className = 'mdzen-pet-confirm-title';
  title.textContent = '清空聊天记录?';

  const bodyTxt = document.createElement('div');
  bodyTxt.className = 'mdzen-pet-confirm-body';
  bodyTxt.textContent = '当前会话的所有消息会被删除, 这一步不可撤销。';

  const toggle = document.createElement('label');
  toggle.className = 'mdzen-pet-confirm-toggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  const lbl = document.createElement('div');
  lbl.className = 'mdzen-pet-confirm-toggle-label';
  lbl.innerHTML = '也让她忘掉关于你的记忆<small>(她记得的事实和概要也会一起清空, 下次见面像第一次)</small>';
  toggle.appendChild(cb);
  toggle.appendChild(lbl);

  const actions = document.createElement('div');
  actions.className = 'mdzen-pet-confirm-actions';
  const cancel = document.createElement('button');
  cancel.className = 'mdzen-pet-confirm-btn cancel';
  cancel.textContent = '取消';
  const confirm = document.createElement('button');
  confirm.className = 'mdzen-pet-confirm-btn danger';
  confirm.textContent = '清空';
  actions.appendChild(cancel);
  actions.appendChild(confirm);

  card.appendChild(title);
  card.appendChild(bodyTxt);
  card.appendChild(toggle);
  card.appendChild(actions);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const dismiss = (): void => overlay.remove();
  cancel.addEventListener('click', dismiss);
  confirm.addEventListener('click', () => {
    const alsoMem = cb.checked;
    dismiss();
    onConfirm(alsoMem);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
}

function stripThinkBlocks(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = out.lastIndexOf('<think>');
  if (open >= 0 && out.indexOf('</think>', open) < 0) {
    out = out.slice(0, open);
  }
  return out.trim();
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
