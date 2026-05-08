import { renderMarkdownTiny } from './markdown-tiny.ts';
import { getRoutePrefix } from './route-config.ts';
import { stripThinkBlocks } from '../shared/strip-think.ts';

interface HistoryMessage {
  role: string;
  content: string;
  timestamp: number;
}

interface AcquiredTraitDTO {
  category: 'habit' | 'preference' | 'relation_belief';
  text: string;
  confidence: number;
  firstObservedAt: number;
  lastReinforcedAt: number;
  reinforcementCount: number;
}

interface AcquiredStateDTO {
  traits: AcquiredTraitDTO[];
  updatedAt: number;
}

interface DreamLogEntryDTO {
  ts: number;
  newEpisodeCount: number;
  questions: string[];
  insights: { text: string; cited: number[] }[];
  appliedOps: unknown[];
}

interface DreamLogDTO {
  lastDreamAt: number;
  dreamedThruEpisodeCount: number;
  recentDreams: DreamLogEntryDTO[];
}
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

/* Tabs */
.mdzen-pet-tabs {
  display: flex;
  gap: 4px;
  padding: 0 22px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}
.mdzen-pet-tab {
  padding: 10px 14px;
  font-size: 12.5px;
  color: #666;
  background: transparent;
  border: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 120ms ease, border-color 120ms ease;
  font-family: inherit;
}
.mdzen-pet-tab:hover { color: #333; }
.mdzen-pet-tab.active {
  color: #c44b87;
  border-bottom-color: #c44b87;
}

/* Acquired list */
.mdzen-pet-acq-section { margin-bottom: 18px; }
.mdzen-pet-acq-title {
  font-size: 12px; color: #888; font-weight: 600;
  margin-bottom: 6px; padding-bottom: 4px;
  border-bottom: 1px dashed #e0e0e0;
}
.mdzen-pet-acq-item {
  font-size: 13px; line-height: 1.5; padding: 4px 0;
  display: flex; gap: 6px; align-items: baseline;
}
.mdzen-pet-acq-conf {
  font-size: 10px; color: #aaa;
  flex-shrink: 0;
}

/* Reconciled (dropped) traits — appears under the acquired tab as a small
 * "她最近放下了" section, sourced from dream-log appliedOps. */
.mdzen-pet-reconcile-section {
  margin-top: 22px;
  padding-top: 14px;
  border-top: 1px solid #f0e8ec;
}
.mdzen-pet-reconcile-title {
  font-size: 12px; color: #a87b8c; font-weight: 600;
  margin-bottom: 8px;
}
.mdzen-pet-reconcile-item {
  font-size: 12.5px; line-height: 1.5;
  padding: 6px 0;
  color: #666;
}
.mdzen-pet-reconcile-text {
  text-decoration: line-through;
  text-decoration-color: #c4a4af;
  color: #998089;
  margin-right: 6px;
}
.mdzen-pet-reconcile-reason {
  display: block;
  font-size: 11.5px;
  color: #8c6c78;
  font-style: italic;
  margin-top: 2px;
  padding-left: 4px;
}
.mdzen-pet-reconcile-when {
  font-size: 10.5px; color: #b8a4ac;
  margin-left: 4px;
}

/* Dream entry */
.mdzen-pet-dream-entry {
  background: #fafaf8;
  border: 1px solid #ebe8e0;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}
.mdzen-pet-dream-time {
  font-size: 11px; color: #aaa; margin-bottom: 8px;
}
.mdzen-pet-dream-q {
  font-size: 12.5px; color: #6a4d62; font-style: italic;
  margin: 4px 0;
}
.mdzen-pet-dream-i {
  font-size: 13px; line-height: 1.55; color: #2c1820;
  margin: 6px 0;
  padding-left: 10px; border-left: 2px solid #d8b8c8;
}
.mdzen-pet-dream-cite {
  font-size: 10px; color: #aaa; margin-left: 4px;
}
`;
  document.head.appendChild(style);
}

type Tab = 'chat' | 'acquired' | 'dreams';

export async function showHistoryModal(sessionId: string): Promise<void> {
  ensureStylesheet();
  let messages = await loadHistory(sessionId);
  let activeTab: Tab = 'chat';

  const overlay = document.createElement('div');
  overlay.className = 'mdzen-pet-history-overlay';
  const card = document.createElement('div');
  card.className = 'mdzen-pet-history-card';

  // ─── Header ─────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'mdzen-pet-history-header';
  const title = document.createElement('div');
  title.className = 'mdzen-pet-history-title';
  const updateTitle = (): void => {
    if (activeTab === 'chat') title.textContent = `聊天历史 · ${messages.length} 条消息`;
    else if (activeTab === 'acquired') title.textContent = '她长成的样子';
    else title.textContent = '她最近的梦';
  };

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

  // ─── Tabs ───────────────────────────────────────────────────
  const tabs = document.createElement('div');
  tabs.className = 'mdzen-pet-tabs';

  const mkTab = (key: Tab, label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = `mdzen-pet-tab${activeTab === key ? ' active' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => switchTab(key));
    return b;
  };
  const tabChat = mkTab('chat', '聊天');
  const tabAcq = mkTab('acquired', '她长成的样子');
  const tabDream = mkTab('dreams', '她的梦');
  tabs.appendChild(tabChat);
  tabs.appendChild(tabAcq);
  tabs.appendChild(tabDream);

  // ─── Body ───────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'mdzen-pet-history-body';

  const renderChat = (): void => {
    body.innerHTML = '';
    if (messages.length === 0) {
      body.appendChild(emptyEl('还没有聊过什么呢~'));
      return;
    }
    for (const m of messages) {
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

  const renderAcquired = async (): Promise<void> => {
    body.innerHTML = '';
    body.appendChild(emptyEl('加载中...'));
    // Acquired + dreams loaded together — reconcile entries live in dream-log
    // appliedOps and surface here as "她最近放下了" so the user sees the full
    // arc (what stayed + what she let go).
    const [acq, log] = await Promise.all([loadAcquired(), loadDreams()]);
    body.innerHTML = '';
    const recentReconciles = collectRecentReconciles(log);
    if ((!acq || acq.traits.length === 0) && recentReconciles.length === 0) {
      body.appendChild(emptyEl('她还没养出什么固定的小习惯'));
      return;
    }
    if (acq && acq.traits.length > 0) {
      const groups: Record<string, AcquiredTraitDTO[]> = {
        habit: [],
        preference: [],
        relation_belief: [],
      };
      for (const t of acq.traits) groups[t.category]?.push(t);
      const labels: Record<string, string> = {
        habit: '习惯',
        preference: '偏好',
        relation_belief: '她对你的看法',
      };
      for (const cat of ['habit', 'preference', 'relation_belief']) {
        const list = groups[cat]!;
        if (list.length === 0) continue;
        const section = document.createElement('div');
        section.className = 'mdzen-pet-acq-section';
        const t = document.createElement('div');
        t.className = 'mdzen-pet-acq-title';
        t.textContent = labels[cat]!;
        section.appendChild(t);
        const sorted = [...list].sort((a, b) => b.confidence - a.confidence);
        for (const trait of sorted) {
          const item = document.createElement('div');
          item.className = 'mdzen-pet-acq-item';
          const text = document.createElement('span');
          text.textContent = trait.text;
          const conf = document.createElement('span');
          conf.className = 'mdzen-pet-acq-conf';
          // No raw number — verbal label, MIT Petz principle.
          conf.textContent =
            trait.confidence < 0.55 ? '· 弱' : trait.confidence < 0.8 ? '· 中' : '· 强';
          item.appendChild(text);
          item.appendChild(conf);
          section.appendChild(item);
        }
        body.appendChild(section);
      }
    }
    if (recentReconciles.length > 0) {
      const section = document.createElement('div');
      section.className = 'mdzen-pet-reconcile-section';
      const title = document.createElement('div');
      title.className = 'mdzen-pet-reconcile-title';
      title.textContent = '她最近放下了';
      section.appendChild(title);
      for (const r of recentReconciles) {
        const item = document.createElement('div');
        item.className = 'mdzen-pet-reconcile-item';
        const head = document.createElement('span');
        const text = document.createElement('span');
        text.className = 'mdzen-pet-reconcile-text';
        text.textContent = r.droppedText;
        const when = document.createElement('span');
        when.className = 'mdzen-pet-reconcile-when';
        when.textContent = formatRelative(r.ts);
        head.appendChild(text);
        head.appendChild(when);
        const reason = document.createElement('span');
        reason.className = 'mdzen-pet-reconcile-reason';
        reason.textContent = `因为: ${r.reason}`;
        item.appendChild(head);
        item.appendChild(reason);
        section.appendChild(item);
      }
      body.appendChild(section);
    }
  };

  // Pull reconcile_trait ops out of the dream log; newest first, capped at 10.
  // Defensive against unknown op shapes (server may extend op types later).
  function collectRecentReconciles(
    log: DreamLogDTO | null,
  ): { droppedText: string; reason: string; ts: number }[] {
    if (!log) return [];
    const out: { droppedText: string; reason: string; ts: number }[] = [];
    for (const dream of log.recentDreams) {
      for (const op of dream.appliedOps) {
        if (!op || typeof op !== 'object') continue;
        const o = op as { op?: string; droppedText?: string; reason?: string };
        if (o.op !== 'reconcile_trait') continue;
        if (typeof o.droppedText !== 'string' || !o.droppedText) continue;
        if (typeof o.reason !== 'string' || !o.reason) continue;
        out.push({ droppedText: o.droppedText, reason: o.reason, ts: dream.ts });
      }
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 10);
  }

  function formatRelative(ts: number): string {
    const ageMs = Date.now() - ts;
    const days = Math.floor(ageMs / 86_400_000);
    if (days <= 0) return ' · 今天';
    if (days === 1) return ' · 昨天';
    if (days < 7) return ` · ${days} 天前`;
    if (days < 30) return ` · ${Math.floor(days / 7)} 周前`;
    return ` · ${Math.floor(days / 30)} 个月前`;
  }

  const renderDreams = async (): Promise<void> => {
    body.innerHTML = '';
    body.appendChild(emptyEl('加载中...'));
    const log = await loadDreams();
    body.innerHTML = '';
    if (!log || log.recentDreams.length === 0) {
      body.appendChild(emptyEl('她还没做过梦呢'));
      return;
    }
    // Newest first
    const dreams = [...log.recentDreams].reverse();
    for (const d of dreams) {
      const card = document.createElement('div');
      card.className = 'mdzen-pet-dream-entry';
      const time = document.createElement('div');
      time.className = 'mdzen-pet-dream-time';
      time.textContent = formatDateTime(d.ts);
      card.appendChild(time);
      for (const q of d.questions.slice(0, 3)) {
        const ql = document.createElement('div');
        ql.className = 'mdzen-pet-dream-q';
        ql.textContent = `· ${q}`;
        card.appendChild(ql);
      }
      for (const ins of d.insights.slice(0, 5)) {
        const il = document.createElement('div');
        il.className = 'mdzen-pet-dream-i';
        const span = document.createElement('span');
        span.textContent = ins.text;
        il.appendChild(span);
        if (ins.cited.length) {
          const cite = document.createElement('span');
          cite.className = 'mdzen-pet-dream-cite';
          cite.textContent = ` (因为 ep ${ins.cited.join(', ')})`;
          il.appendChild(cite);
        }
        card.appendChild(il);
      }
      body.appendChild(card);
    }
  };

  const switchTab = (next: Tab): void => {
    activeTab = next;
    tabChat.classList.toggle('active', next === 'chat');
    tabAcq.classList.toggle('active', next === 'acquired');
    tabDream.classList.toggle('active', next === 'dreams');
    clearBtn.style.display = next === 'chat' ? '' : 'none';
    updateTitle();
    if (next === 'chat') renderChat();
    else if (next === 'acquired') void renderAcquired();
    else void renderDreams();
  };

  updateTitle();
  renderChat();

  card.appendChild(header);
  card.appendChild(tabs);
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
        await fetch(`${getRoutePrefix()}/history?session=${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
        if (alsoMemory) {
          await fetch(`${getRoutePrefix()}/memory`, { method: 'DELETE' });
        }
      } catch {}
      messages = [];
      updateTitle();
      renderChat();
    });
  });
}

function emptyEl(text: string): HTMLDivElement {
  const e = document.createElement('div');
  e.className = 'mdzen-pet-history-empty';
  e.textContent = text;
  return e;
}

async function loadAcquired(): Promise<AcquiredStateDTO | null> {
  try {
    const r = await fetch(`${getRoutePrefix()}/acquired`);
    if (!r.ok) return null;
    return (await r.json()) as AcquiredStateDTO;
  } catch {
    return null;
  }
}

async function loadDreams(): Promise<DreamLogDTO | null> {
  try {
    const r = await fetch(`${getRoutePrefix()}/dreams`);
    if (!r.ok) return null;
    return (await r.json()) as DreamLogDTO;
  } catch {
    return null;
  }
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN');
}

async function loadHistory(sessionId: string): Promise<HistoryMessage[]> {
  try {
    const r = await fetch(`${getRoutePrefix()}/history?session=${encodeURIComponent(sessionId)}`);
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


function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
