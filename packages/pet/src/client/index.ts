import { Sprite } from './sprite.ts';
import { Loop } from './loop.ts';
import { attachDrag } from './drag.ts';
import { BubbleHost } from './bubble.ts';
import { CooldownGate } from './cooldown.ts';
import { mixedLine } from './lines.ts';
import { attachSelection } from './triggers/selection.ts';
import { attachCopy } from './triggers/copy.ts';
import { attachIdle } from './triggers/idle.ts';
import { attachCeremonial } from './triggers/ceremonial.ts';
import { attachMischief } from './mischief.ts';
import { peekOnLoad, attachDodgeClick } from './peek-dodge.ts';
import { globalEmotion } from './emotion-client.ts';
import { globalBusy } from './busy.ts';
import { InputBar } from './input-bar.ts';
import { PetSpeech } from './pet-speech.ts';
import { SseConsumer, postChat } from './sse-consumer.ts';
import { showDiffModal } from './diff-modal.ts';
import { showHistoryModal } from './history-modal.ts';
import { recordDrag } from './drag-log.ts';
import { pickPreset } from './presets.ts';
import { SignalReporter } from './signal.ts';
import { clampPoint, computeBound, type Rect } from './boundary.ts';
import type { FsmState } from '../shared/types.ts';

declare global {
  interface Window {
    __mdzenPet?: { stop: () => void };
    __MDZEN_PET_CONFIG__?: {
      excludeSelectors?: string[];
      padding?: number;
    };
  }
}

const CLICK_REACTIONS: FsmState[] = ['waving', 'jumping', 'waiting'];

function deriveCurrentDoc(): string | undefined {
  const path = window.location.pathname;
  const m = /^\/view\/(.+)$/.exec(path);
  if (m) return decodeURIComponent(m[1] ?? '');
  if (path === '/' || path === '') return undefined;
  return path;
}

function start(): void {
  if (window.__mdzenPet) return;

  const sprite = new Sprite({ size: 72, zIndex: 9999, initialState: 'idle' });
  document.body.appendChild(sprite.el);
  const bubble = new BubbleHost(sprite.el);
  const speech = new PetSpeech(sprite, bubble);

  void globalEmotion.refresh();

  const config = window.__MDZEN_PET_CONFIG__ ?? {};
  const excludeSelectors: string[] = config.excludeSelectors ?? [
    '.toc-sidebar',
    '.file-nav',
    '.preview-toc',
    '.preview-nav',
  ];
  const padding: number = config.padding ?? 24;

  const getExcluded = (): Rect[] => {
    const out: Rect[] = [];
    for (const sel of excludeSelectors) {
      document.querySelectorAll(sel).forEach((node) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      });
    }
    return out;
  };

  const loop = new Loop({
    sprite,
    getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
    getExcluded,
    padding,
  });
  loop.start();

  const initialBound = computeBound({
    viewport: { w: window.innerWidth, h: window.innerHeight },
    excluded: getExcluded(),
    padding,
  });
  peekOnLoad(sprite, loop, {
    x: initialBound.x + initialBound.w * 0.9,
    y: initialBound.y + initialBound.h * 0.9,
  });

  const mischief = attachMischief({
    loop,
    sprite,
    getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
    getExcluded,
    padding,
  });
  const dodge = attachDodgeClick(sprite, loop);

  let dragCount = 0;
  let sessionId = sessionStorage.getItem('mdzen-pet-session');
  if (!sessionId) {
    sessionId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('mdzen-pet-session', sessionId);
  }

  const inputBar = new InputBar({
    placeholder: '想问什么? Enter 发送, Esc 关闭',
    onSubmit: (text) => {
      speech.acknowledge();
      void (async () => {
        const r = await postChat(sessionId!, text, { currentDoc: deriveCurrentDoc() });
        if (r.status === 503) {
          speech.fail('没接 LLM');
        } else if (r.status >= 400) {
          speech.fail(`${r.status}`);
        }
      })();
    },
    onOpenHistory: () => void showHistoryModal(sessionId!),
  });

  // Click reaction: cycle a small action AND toggle input bar.
  // dodge.attachDodgeClick already steals 15% of clicks (calls preventDefault);
  // when she dodges, this handler short-circuits.
  let lastReactionIdx = -1;
  sprite.img.addEventListener('click', (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (globalBusy.isBusy()) return;
    globalEmotion.emit('click');

    let next: FsmState;
    do {
      next = CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)] ?? 'waving';
    } while (CLICK_REACTIONS.length > 1 && CLICK_REACTIONS.indexOf(next) === lastReactionIdx);
    lastReactionIdx = CLICK_REACTIONS.indexOf(next);
    sprite.setState(next);
    setTimeout(() => sprite.setState('idle'), 1100);

    if (!globalEmotion.isHiding()) inputBar.toggle();
  });

  const reporter = new SignalReporter(sessionId, deriveCurrentDoc);
  reporter.start();

  const sse = new SseConsumer(sessionId, {
    onToken: (text) => speech.receiveToken(text),
    onFinal: () => speech.finalize(),
    onError: (message) => speech.fail(message),
    onProposeEdit: (payload) =>
      showDiffModal({
        proposalId: payload.proposalId,
        path: payload.path,
        oldText: payload.oldText,
        newText: payload.newText,
        reason: payload.reason,
      }),
    onEditApplied: (payload) => {
      bubble.show({ text: `✓ 已写入 ${payload.path}`, variant: 'passive', durationMs: 4000 });
    },
  });

  const gate = new CooldownGate({ globalMs: 30_000 });
  const selection = attachSelection(bubble, gate);
  const copy = attachCopy(bubble, gate);
  const idle = attachIdle(bubble, gate);
  const ceremonial = attachCeremonial(bubble, gate, sprite);

  const drag = attachDrag({
    trigger: sprite.img,
    isBlocked: () => globalBusy.isBusy(),
    onDragStart: () => {
      loop.freeze();
      sprite.setState('waiting');
      // Protest is deferred — see milestones below.
    },
    milestones: [
      {
        atMs: 1500,
        emit: () =>
          bubble.show({
            text: mixedLine('protest'),
            variant: 'protest',
            durationMs: 2000,
          }),
      },
      {
        atMs: 4500,
        emit: () =>
          bubble.show({
            text: pickPreset('protest'),
            variant: 'protest',
            durationMs: 3000,
          }),
      },
      {
        atMs: 30_000,
        emit: () => {
          sprite.setState('waiting');
          bubble.show({ text: '我有点晕…', variant: 'protest', durationMs: 4000 });
          globalEmotion.emit('drag-too-long');
        },
      },
    ],
    onDragMove: (x, y) => {
      const bound = computeBound({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        excluded: getExcluded(),
        padding,
      });
      const clamped = clampPoint({ x, y }, bound);
      sprite.setPosition(clamped.x, clamped.y);
      loop.setPosition(clamped.x, clamped.y);
    },
    onDragEnd: (durationMs) => {
      sprite.setState('jumping');
      loop.unfreeze();
      const { countInWindow } = recordDrag(durationMs);
      dragCount = countInWindow;
      // Affection penalty scales with both count-in-window and duration:
      //   short drag, first occurrence -> drag-1st
      //   3+ in 5min                    -> drag-3plus (cumulative annoyance)
      //   any single drag > 30s         -> drag-too-long (already emitted in milestone)
      if (countInWindow >= 3) {
        globalEmotion.emit('drag-3plus');
      } else {
        globalEmotion.emit('drag-1st');
      }
    },
  });

  window.__mdzenPet = {
    stop: () => {
      reporter.stop();
      sse.destroy();
      inputBar.destroy();
      selection.destroy();
      copy.destroy();
      idle.destroy();
      ceremonial.destroy();
      mischief.destroy();
      dodge.destroy();
      drag.destroy();
      bubble.destroy();
      loop.stop();
      sprite.destroy();
      window.__mdzenPet = undefined;
    },
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
