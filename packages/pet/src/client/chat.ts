import type { Sprite } from './sprite.ts';
import { showDiffModal } from './diff-modal.ts';

const PREFIX = '/api/pet';

export interface ChatHostOptions {
  sprite: Sprite;
  sessionId: string;
}

export class ChatHost {
  private opts: ChatHostOptions;
  private root: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private panel: HTMLDivElement;
  private list: HTMLDivElement;
  private input: HTMLTextAreaElement;
  private sse: EventSource | null = null;
  private currentAssistant: HTMLDivElement | null = null;

  constructor(opts: ChatHostOptions) {
    this.opts = opts;

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      zIndex: '10000',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    });

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.textContent = '💬';
    this.toggleBtn.setAttribute('aria-label', 'open chat');
    Object.assign(this.toggleBtn.style, {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: '1px solid #d06b9a',
      background: '#fde7f3',
      cursor: 'pointer',
      fontSize: '18px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    });

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      display: 'none',
      width: '320px',
      height: '420px',
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      flexDirection: 'column',
      position: 'absolute',
      right: '0',
      bottom: '52px',
      overflow: 'hidden',
    });

    this.list = document.createElement('div');
    Object.assign(this.list.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '12px',
      fontSize: '13px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    });

    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
      borderTop: '1px solid #eee',
      padding: '8px',
      display: 'flex',
      gap: '6px',
    });

    this.input = document.createElement('textarea');
    Object.assign(this.input.style, {
      flex: '1',
      resize: 'none',
      height: '36px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      padding: '6px 8px',
      fontSize: '13px',
      fontFamily: 'inherit',
      outline: 'none',
    });
    this.input.placeholder = '问点什么...';

    const send = document.createElement('button');
    send.textContent = '发送';
    Object.assign(send.style, {
      padding: '0 12px',
      borderRadius: '6px',
      border: '1px solid #d06b9a',
      background: '#fde7f3',
      cursor: 'pointer',
      fontSize: '13px',
    });

    inputRow.appendChild(this.input);
    inputRow.appendChild(send);
    this.panel.appendChild(this.list);
    this.panel.appendChild(inputRow);
    this.root.appendChild(this.panel);
    this.root.appendChild(this.toggleBtn);
    document.body.appendChild(this.root);

    this.toggleBtn.addEventListener('click', () => this.toggleOpen());
    send.addEventListener('click', () => void this.send());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.send();
      }
    });

    void this.loadHistory();
    this.openSSE();
  }

  private toggleOpen(): void {
    const open = this.panel.style.display === 'flex';
    this.panel.style.display = open ? 'none' : 'flex';
    if (!open) this.input.focus();
  }

  private async loadHistory(): Promise<void> {
    try {
      const r = await fetch(`${PREFIX}/history?session=${encodeURIComponent(this.opts.sessionId)}`);
      if (!r.ok) return;
      const msgs = (await r.json()) as Array<{ role: string; content: string }>;
      for (const m of msgs) this.append(m.role, m.content);
    } catch {}
  }

  private openSSE(): void {
    this.sse = new EventSource(`${PREFIX}/sse?session=${encodeURIComponent(this.opts.sessionId)}`);
    this.sse.onmessage = (e: MessageEvent) => {
      try {
        const ev = JSON.parse(e.data as string);
        if (ev.type === 'token') {
          this.opts.sprite.setState('review');
          this.appendToken(ev.text);
        } else if (ev.type === 'final') {
          this.currentAssistant = null;
          this.opts.sprite.setState('idle');
        } else if (ev.type === 'propose-edit') {
          showDiffModal({
            proposalId: ev.proposalId,
            path: ev.path,
            oldText: ev.oldText,
            newText: ev.newText,
            reason: ev.reason,
            onApplied: () => this.append('system', `已应用修改: ${ev.path}`),
          });
        } else if (ev.type === 'edit-applied') {
          this.append('system', `✓ 已写入 ${ev.path}`);
        } else if (ev.type === 'error') {
          this.append('system', `出错了: ${ev.message ?? ''}`);
          this.opts.sprite.setState('failed');
          setTimeout(() => this.opts.sprite.setState('idle'), 2000);
          this.currentAssistant = null;
        }
      } catch {}
    };
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.append('user', text);
    try {
      const r = await fetch(`${PREFIX}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: this.opts.sessionId, text }),
      });
      if (r.status === 503) {
        this.append('system', '我今天不太想说话呢 (没接 LLM)');
      }
    } catch {
      this.append('system', '发送失败');
    }
  }

  private append(role: string, text: string): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      padding: '6px 10px',
      borderRadius: '8px',
      maxWidth: '85%',
      wordWrap: 'break-word',
      ...(role === 'user'
        ? { background: '#f0f4ff', alignSelf: 'flex-end' }
        : role === 'assistant'
          ? { background: '#fde7f3', alignSelf: 'flex-start' }
          : { background: '#f5f5f5', color: '#888', fontStyle: 'italic', alignSelf: 'center' }),
    });
    el.textContent = text;
    this.list.appendChild(el);
    this.list.scrollTop = this.list.scrollHeight;
    if (role === 'assistant') this.currentAssistant = el;
    return el;
  }

  private appendToken(text: string): void {
    if (!this.currentAssistant) {
      this.currentAssistant = this.append('assistant', '');
    }
    this.currentAssistant.textContent = (this.currentAssistant.textContent ?? '') + text;
    this.list.scrollTop = this.list.scrollHeight;
  }

  destroy(): void {
    this.sse?.close();
    this.root.remove();
  }
}
