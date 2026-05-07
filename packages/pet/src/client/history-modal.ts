interface HistoryMessage {
  role: string;
  content: string;
  timestamp: number;
}

const PREFIX = '/api/pet';

export async function showHistoryModal(sessionId: string): Promise<void> {
  let messages: HistoryMessage[] = [];
  try {
    const r = await fetch(`${PREFIX}/history?session=${encodeURIComponent(sessionId)}`);
    if (r.ok) messages = (await r.json()) as HistoryMessage[];
  } catch {}

  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.45)',
    zIndex: '20000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff',
    width: '560px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    borderRadius: '14px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });
  const title = document.createElement('div');
  title.textContent = `聊天历史 · ${messages.length} 条消息`;
  const close = document.createElement('button');
  close.textContent = '×';
  Object.assign(close.style, {
    width: '28px',
    height: '28px',
    border: 'none',
    background: 'transparent',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#888',
    lineHeight: '1',
  });
  header.appendChild(title);
  header.appendChild(close);

  const body = document.createElement('div');
  Object.assign(body.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
    lineHeight: '1.55',
    color: '#222',
  });

  if (messages.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '还没有聊过什么呢~';
    Object.assign(empty.style, {
      color: '#999',
      textAlign: 'center',
      padding: '40px 0',
      fontStyle: 'italic',
    });
    body.appendChild(empty);
  } else {
    for (const m of messages) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
      });
      const bubble = document.createElement('div');
      Object.assign(bubble.style, {
        padding: '8px 12px',
        borderRadius: '12px',
        maxWidth: '78%',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        background:
          m.role === 'user'
            ? '#f0f4ff'
            : m.role === 'assistant'
              ? '#fde7f3'
              : '#f5f5f5',
        color: m.role === 'system' ? '#888' : '#222',
        fontStyle: m.role === 'system' ? 'italic' : 'normal',
      });
      bubble.textContent = stripThinkBlocks(m.content);
      const meta = document.createElement('div');
      meta.textContent = formatTime(m.timestamp);
      Object.assign(meta.style, {
        fontSize: '10px',
        color: '#bbb',
        flexShrink: '0',
        paddingTop: '10px',
      });
      row.appendChild(bubble);
      row.appendChild(meta);
      body.appendChild(row);
    }
  }

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  body.scrollTop = body.scrollHeight;

  const dismiss = (): void => overlay.remove();
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey);
      dismiss();
    }
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
