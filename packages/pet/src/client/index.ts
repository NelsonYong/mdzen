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
import { getSessionId } from './session.ts';
import { bootInput } from './boot-input.ts';
import { bootHistory } from './boot-history.ts';
import { attachSpriteFloater, type SpriteFloater } from './window-drag.ts';
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
      /**
       * Which window/page is rendering the client.
       *
       * - 'embedded' (default): full client — sprite + input + history modal.
       *   Used by mdzen, where pet shares the page with markdown content.
       * - 'sprite': only sprite + bubble + SSE token rendering. Used by the
       *   desktop main window. The sprite is pinned to viewport center and
       *   never moves; the OS window IS the sprite. Click on sprite asks
       *   the host (Tauri) to open the input window via IPC.
       * - 'input': only the chat input bar (separate desktop window).
       * - 'history': only the history modal (separate desktop window).
       */
      mode?: 'embedded' | 'sprite' | 'input' | 'history';
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

/**
 * Best-effort: ask the Tauri host to do something. In browser embedded
 * mode `__TAURI__` is undefined and these calls become no-ops. Each call
 * site has its own fallback (e.g. for input toggle, embedded falls back
 * to the in-page InputBar).
 */
function tauriInvoke(cmd: string): void {
  const tauri = (window as { __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } } })
    .__TAURI__;
  tauri?.core?.invoke?.(cmd).catch(() => {});
}

function start(): void {
  if (window.__seren) return;
  const config = window.__SEREN_CONFIG__ ?? {};
  const mode = config.mode ?? 'embedded';
  if (mode === 'input') return bootInput();
  if (mode === 'history') return bootHistory();
  // embedded + sprite share most of the bootstrap below.
  return bootSpriteOrEmbedded(mode);
}

function bootSpriteOrEmbedded(mode: 'embedded' | 'sprite'): void {
  const config = window.__SEREN_CONFIG__ ?? {};
  const isFloating = mode === 'sprite';
  const showSprite = config.showSprite !== false;
  // In floating mode the sprite is the entire window — autonomous motion
  // would mean the sprite trying to "walk" within a 180×180 frame, which
  // looks broken. Force off.
  const autonomousMotion = isFloating ? false : config.autonomousMotion !== false;
  const llmActions = config.llmActions !== false;
  const routePrefix = (config.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const assetsBase = `${routePrefix}/assets/`;

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

  // Floating mode: pin sprite to viewport center. The OS window itself is
  // small (just bigger than the sprite), and dragging the sprite moves the
  // OS window via Rust's set_position — so the sprite's position WITHIN
  // the webview stays centered. window-state plugin remembers last OS
  // window position across launches.
  // Embedded mode: park anchor at bottom-right when invisible.
  if (isFloating) {
    const center = (): void => {
      const cx = window.innerWidth / 2 - 36; // sprite is 72px, center it
      const cy = window.innerHeight / 2 - 36;
      sprite.setPosition(cx, cy);
    };
    center();
    window.addEventListener('resize', center);
  } else if (!showSprite) {
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

  // Peek-on-load + mischief + dodge are sprite-motion behaviors. Off in
  // floating mode (window is too small + sprite is pinned).
  if (showSprite && !isFloating) {
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

  const mischief = showSprite && !isFloating
    ? attachMischief({
        loop,
        sprite,
        getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
        getExcluded,
        padding,
      })
    : { destroy: () => undefined };
  const dodge = showSprite && !isFloating
    ? attachDodgeClick(sprite, loop)
    : { destroy: () => undefined };

  let dragCount = 0;
  const sessionId = getSessionId();

  // In floating mode the input window is a separate Tauri window. In
  // embedded mode we still build the in-page InputBar.
  const inputBar = isFloating
    ? null
    : new InputBar({
        placeholder: '想问什么? Enter 发送, Esc 关闭',
        onSubmit: (text) => {
          speech.acknowledge();
          void (async () => {
            const r = await postChat(sessionId, text, {
              currentDoc: deriveCurrentDoc(),
              currentActivity: loop.getActivity(),
            });
            if (r.status === 503) {
              speech.fail('没接 LLM');
            } else if (r.status >= 400) {
              speech.fail(`${r.status}`);
            }
          })();
        },
        onOpenHistory: () => void showHistoryModal(sessionId),
      });

  // Click reaction. In floating mode, click → IPC to host (open input
  // window). Drag in floating mode → move sprite within the webview (CSS
  // transform). In embedded mode, click → toggle the in-page InputBar.
  let lastReactionIdx = -1;
  let spriteFloater: SpriteFloater | null = null;
  if (showSprite) {
    const onSpriteClick = (): void => {
      if (globalBusy.isBusy()) return;
      globalEmotion.emit('click');

      let next: FsmState;
      do {
        next = CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)] ?? 'waving';
      } while (CLICK_REACTIONS.length > 1 && CLICK_REACTIONS.indexOf(next) === lastReactionIdx);
      lastReactionIdx = CLICK_REACTIONS.indexOf(next);
      sprite.setState(next);
      setTimeout(() => sprite.setState('idle'), 1100);

      if (globalEmotion.isHiding()) return;
      if (isFloating) {
        tauriInvoke('toggle_input_window');
      } else {
        inputBar?.toggle();
      }
    };

    if (isFloating) {
      // Floating mode: drag the sprite = drive Tauri's `set_position` to
      // move the OS window itself (sprite stays pinned at viewport
      // center). Click = toggle input. See window-drag.ts for why we use
      // `set_position` instead of `startDragging` (Tauri issue #12042).
      spriteFloater = attachSpriteFloater({
        el: sprite.img,
        onClick: onSpriteClick,
      });
    } else {
      // Embedded (mdzen) mode: click directly toggles in-page input bar.
      // dodge.attachDodgeClick steals 15% of clicks (calls preventDefault)
      // when active; we honor that.
      sprite.img.addEventListener('click', (e: MouseEvent) => {
        if (e.defaultPrevented) return;
        onSpriteClick();
      });
    }
  } else if (inputBar) {
    // Headless embedded mode: input bar is the only entry point — open it on
    // startup and rebind a global Cmd/Ctrl-K shortcut so it stays reachable.
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
    // Floating mode: ignore movement commands — sprite is pinned to center
    // and the OS window doesn't carry "go run around" semantics.
    onMoveCommand: isFloating
      ? () => undefined
      : ({ kind, durationSec }) => loop.setMoveCommand(kind, durationSec),
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
  // Selection / copy / idle / ceremonial triggers are document-context
  // behaviors — they read from the surrounding markdown page. In floating
  // mode the page is just the sprite, so these have nothing to react to.
  const triggers = isFloating
    ? {
        selection: { destroy: () => undefined },
        copy: { destroy: () => undefined },
        idle: { destroy: () => undefined },
        ceremonial: { destroy: () => undefined },
      }
    : {
        selection: attachSelection(bubble, gate),
        copy: attachCopy(bubble, gate),
        idle: attachIdle(bubble, gate),
        ceremonial: attachCeremonial(bubble, gate, sprite),
      };

  // Internal sprite drag is for moving the sprite within the document.
  // In floating mode that doesn't make sense — the OS window is what gets
  // dragged (via data-tauri-drag-region on body), and dragging the sprite
  // would fight that.
  const drag = showSprite && !isFloating
    ? attachDrag({
        trigger: sprite.img,
        isBlocked: () => globalBusy.isBusy(),
        onDragStart: () => {
          loop.freeze();
          sprite.setState('waiting');
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
          if (countInWindow >= 3) {
            globalEmotion.emit('drag-3plus');
          } else {
            globalEmotion.emit('drag-1st');
          }
        },
      })
    : { destroy: () => undefined };

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
      inputBar?.destroy();
      triggers.selection.destroy();
      triggers.copy.destroy();
      triggers.idle.destroy();
      triggers.ceremonial.destroy();
      mischief.destroy();
      dodge.destroy();
      drag.destroy();
      spriteFloater?.destroy();
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
