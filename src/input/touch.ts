import type { GameInputCommand } from "./commands";

type TouchButtons = {
  left: HTMLButtonElement;
  right: HTMLButtonElement;
  rotate: HTMLButtonElement;
  softDrop: HTMLButtonElement;
  hardDrop: HTMLButtonElement;
  pause: HTMLButtonElement;
};

type TouchInputOptions = {
  buttons: TouchButtons;
  dispatch: (command: GameInputCommand) => void;
};

/** Held direction buttons repeat like a held key: a short pause, then a steady rate. */
type RepeatTiming = { delayMs: number; intervalMs: number };

const MOVE_REPEAT: RepeatTiming = { delayMs: 170, intervalMs: 60 };
const SOFT_DROP_REPEAT: RepeatTiming = { delayMs: 120, intervalMs: 45 };

export function bindTouchInput(options: TouchInputOptions): void {
  bind(options.buttons.left, options, { kind: "move", dx: -1 }, MOVE_REPEAT);
  bind(options.buttons.right, options, { kind: "move", dx: 1 }, MOVE_REPEAT);
  bind(options.buttons.rotate, options, { kind: "rotate" });
  bind(options.buttons.softDrop, options, { kind: "softDrop" }, SOFT_DROP_REPEAT);
  bind(options.buttons.hardDrop, options, { kind: "hardDrop" });
  bind(options.buttons.pause, options, { kind: "togglePause" });
}

function bind(button: HTMLButtonElement, options: TouchInputOptions, command: GameInputCommand, repeat?: RepeatTiming): void {
  let handledPointer = false;
  let delayTimer: number | undefined;
  let repeatTimer: number | undefined;
  const stopRepeat = (): void => {
    window.clearTimeout(delayTimer);
    window.clearInterval(repeatTimer);
    delayTimer = undefined;
    repeatTimer = undefined;
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    handledPointer = true;
    event.preventDefault();
    options.dispatch(command);
    if (!repeat) return;
    stopRepeat();
    delayTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(() => options.dispatch(command), repeat.intervalMs);
    }, repeat.delayMs);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"] as const) {
    button.addEventListener(type, stopRepeat);
  }
  window.addEventListener("blur", stopRepeat);
  button.addEventListener("click", () => {
    if (handledPointer) {
      handledPointer = false;
      return;
    }
    options.dispatch(command);
  });
}
