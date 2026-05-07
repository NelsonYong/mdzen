export interface DiffModalOptions {
  proposalId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
  onApplied?: () => void;
  onClose?: () => void;
}

export function showDiffModal(opts: DiffModalOptions): void {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.4)',
    zIndex: '20000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff',
    borderRadius: '12px',
    width: '720px',
    maxWidth: '90vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });

  const header = document.createElement('div');
  Object.assign(header.style, { padding: '16px 20px', borderBottom: '1px solid #eee' });
  const fileLabel = document.createElement('div');
  fileLabel.textContent = opts.path;
  Object.assign(fileLabel.style, { fontSize: '13px', color: '#666', marginBottom: '4px' });
  const reasonLabel = document.createElement('div');
  reasonLabel.textContent = opts.reason;
  Object.assign(reasonLabel.style, { fontSize: '14px' });
  header.appendChild(fileLabel);
  header.appendChild(reasonLabel);

  const body = document.createElement('div');
  Object.assign(body.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    padding: '16px',
    flex: '1',
    overflow: 'auto',
  });
  body.appendChild(makeBox('原文', opts.oldText, '#fff5f5'));
  body.appendChild(makeBox('新文', opts.newText, '#f0fff4'));

  const footer = document.createElement('div');
  Object.assign(footer.style, {
    padding: '12px 20px',
    borderTop: '1px solid #eee',
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  });
  const reject = makeBtn('拒绝', '#fff', '#ddd');
  const apply = makeBtn('应用', '#fde7f3', '#d06b9a');
  footer.appendChild(reject);
  footer.appendChild(apply);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = (): void => {
    overlay.remove();
    opts.onClose?.();
  };
  reject.addEventListener('click', close);
  apply.addEventListener('click', () => {
    apply.textContent = '应用中...';
    apply.disabled = true;
    fetch('/api/pet/apply-edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ proposalId: opts.proposalId }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = (await r.json().catch(() => ({}))) as { error?: string };
          alert(`应用失败: ${data.error ?? r.status}`);
          apply.textContent = '应用';
          apply.disabled = false;
          return;
        }
        opts.onApplied?.();
        close();
      })
      .catch(() => {
        apply.textContent = '应用';
        apply.disabled = false;
      });
  });
}

function makeBox(label: string, text: string, bg: string): HTMLDivElement {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
  const lbl = document.createElement('div');
  lbl.textContent = label;
  Object.assign(lbl.style, { fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' });
  const pre = document.createElement('pre');
  pre.textContent = text;
  Object.assign(pre.style, {
    background: bg,
    padding: '12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'ui-monospace, Menlo, monospace',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    margin: '0',
    flex: '1',
    overflow: 'auto',
  });
  wrap.appendChild(lbl);
  wrap.appendChild(pre);
  return wrap;
}

function makeBtn(text: string, bg: string, border: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    padding: '8px 16px',
    borderRadius: '6px',
    border: `1px solid ${border}`,
    background: bg,
    cursor: 'pointer',
    fontSize: '13px',
  });
  return b;
}
