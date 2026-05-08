import { Sprite } from './sprite.ts';
import { createAnimationRegistry, type AnimationDef } from '../shared/animations.ts';
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
    __seren?: {
      stop: () => void;
      /** Force a temporary animation from outside — id can be any registered animation. */
      setReaction?: (animationId: string, durationMs?: number) => void;
    };
    __SEREN_CONFIG__?: {
      excludeSelectors?: string[];
      padding?: number;
      /** Show the animated sprite. Default true. */
      showSprite?: boolean;
      /** Allow autonomous wandering. Default true. */
      autonomousMotion?: boolean;
      /** Let the LLM pick post-reply animation. Default true. */
      llmActions?: boolean;
      /** Override the route prefix the client uses (assets / sse / chat). Default '/api/pet'. */
      routePrefix?: string;
      /** Animation registry snapshot (server-built, mirrors core + user extras). */
      animations?: Array<Omit<AnimationDef, 'category'> & { category?: string }>;
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
  if (window.__seren) return;

  const config = window.__SEREN_CONFIG__ ?? {};
  const showSprite = config.showSprite !== false;
  const autonomousMotion = config.autonomousMotion !== false;
  const llmActions = config.llmActions !== false;
  const routePrefix = (config.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const assetsBase = `${routePrefix}/assets/`;

  // Build a client-side registry mirror so sprite.setAnimation can resolve
  // both core ids and host-registered extension ids via assetUrl lookup.
  const extras = (config.animations ?? [])
    .filter((a) => a && a.id && a.assetUrl)
    .filter((a) => a.category !== 'core')
    .map((a) => ({
      id: a.id,
      assetUrl: a.assetUrl,
      tags: a.tags ?? [],
      defaultDurationMs: a.defaultDurationMs ?? 1500,
    }));
  const registry = createAnimationRegistry(extras);

  const sprite = new Sprite({
    size: 72,
    zIndex: 9999,
    initialState: 'idle',
    visible: showSprite,
    assetsBase,
    registry,
  });
  document.body.appendChild(sprite.el);
  // Park the anchor at bottom-right when invisible so bubbles render in a sensible spot.
  if (!showSprite) {
    sprite.setPosition(window.innerWidth - 96, window.innerHeight - 96);
  }
  const bubble = new BubbleHost(sprite.el);
  const speech = new PetSpeech(sprite, bubble);

  void globalEmotion.refresh();

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
    disableAutonomous: !autonomousMotion,
  });
  loop.start();

  // Peek-on-load, mischief and dodge only make sense when the pet is visible.
  if (showSprite) {
    const initialBound = computeBound({
      viewport: { w: window.innerWidth, h: window.innerHeight },
      excluded: getExcluded(),
      padding,
    });
    peekOnLoad(sprite, loop, {
      x: initialBound.x + initialBound.w * 0.9,
      y: initialBound.y + initialBound.h * 0.9,
    });
  }

  const mischief = showSprite
    ? attachMischief({
        loop,
        sprite,
        getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
        getExcluded,
        padding,
      })
    : { destroy: () => undefined };
  const dodge = showSprite
    ? attachDodgeClick(sprite, loop)
    : { destroy: () => undefined };

  let dragCount = 0;
  let sessionId = sessionStorage.getItem('seren-session');
  if (!sessionId) {
    sessionId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `s${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('seren-session', sessionId);
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
  if (showSprite) {
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
  } else {
    // In headless mode the input bar is the only entry point — open it on startup
    // and rebind a global Cmd/Ctrl-K shortcut so it stays reachable after Esc.
    setTimeout(() => inputBar.toggle(), 600);
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputBar.toggle();
      }
    });
  }

  const reporter = new SignalReporter(sessionId, deriveCurrentDoc);
  reporter.start();

  const sse = new SseConsumer(sessionId, {
    onToken: (text) => speech.receiveToken(text),
    onAck: ({ text, willing }) => speech.applyAck(text, willing),
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
    onAction: ({ animationId, durationMs }) => {
      // Server-side LLM-picked reaction. Registry-validated; unknown ids are no-ops.
      if (!showSprite) return;
      sprite.setAnimation(animationId);
      const dur = durationMs > 0 ? durationMs : 1500;
      setTimeout(() => sprite.setAnimation('idle'), dur);
    },
  });

  const gate = new CooldownGate({ globalMs: 30_000 });
  const selection = attachSelection(bubble, gate);
  const copy = attachCopy(bubble, gate);
  const idle = attachIdle(bubble, gate);
  const ceremonial = attachCeremonial(bubble, gate, sprite);

  const drag = showSprite
    ? attachDrag({
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
  })
    : { destroy: () => undefined };

  // Public host hook: drive any registered animation from outside (id can be core OR extension).
  // No-ops when sprite is hidden — caller need not branch.
  const setReaction = (next: string, durationMs = 1100): void => {
    if (!showSprite) return;
    sprite.setAnimation(next);
    if (durationMs > 0) setTimeout(() => sprite.setAnimation('idle'), durationMs);
  };

  window.__seren = {
    setReaction,
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
      window.__seren = undefined;
    },
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
