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

export function bindTouchInput(options: TouchInputOptions): void {
  bind(options.buttons.left, options, { kind: "move", dx: -1 });
  bind(options.buttons.right, options, { kind: "move", dx: 1 });
  bind(options.buttons.rotate, options, { kind: "rotate" });
  bind(options.buttons.softDrop, options, { kind: "softDrop" });
  bind(options.buttons.hardDrop, options, { kind: "hardDrop" });
  bind(options.buttons.pause, options, { kind: "togglePause" });
}

function bind(button: HTMLButtonElement, options: TouchInputOptions, command: GameInputCommand): void {
  button.addEventListener("click", () => {
    options.dispatch(command);
  });
}
