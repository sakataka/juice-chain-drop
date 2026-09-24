import type { GameInputCommand, GameInputState } from "./commands";

type KeyboardInputOptions = {
  getState: () => GameInputState;
  dispatch: (command: GameInputCommand) => void;
};

const HANDLED_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Enter", "Escape", "p", "P"]);
const TEXT_ENTRY_SELECTOR = "input, select, textarea, [contenteditable='true']";

/** Settings controls own their keys; game buttons keep Space/arrows so play never re-clicks Start. */
function isFormControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(TEXT_ENTRY_SELECTOR) !== null;
}

export function bindKeyboardInput(options: KeyboardInputOptions): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key;
    if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isFormControl(event.target)) return;
    if (HANDLED_KEYS.has(key)) {
      event.preventDefault();
    }

    const snapshot = options.getState();
    if (key === "Enter") {
      if (snapshot.state === "ready" || snapshot.state === "gameover") {
        options.dispatch({ kind: "start" });
      }
      return;
    }

    if (key === "Escape" || key.toLowerCase() === "p") {
      options.dispatch({ kind: "togglePause" });
      return;
    }

    if (snapshot.state !== "playing" || !snapshot.hasActivePiece) return;

    if (key === "ArrowLeft") options.dispatch({ kind: "move", dx: -1 });
    if (key === "ArrowRight") options.dispatch({ kind: "move", dx: 1 });
    if (key === "ArrowDown") options.dispatch({ kind: "softDrop" });
    if (key === "ArrowUp") options.dispatch({ kind: "rotate" });
    if (key === " ") options.dispatch({ kind: "hardDrop" });

  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}
