import type { GameInputCommand, GameInputState } from "./commands";

type KeyboardInputOptions = {
  getState: () => GameInputState;
  dispatch: (command: GameInputCommand) => void;
};

const CONTROL_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Enter", "Escape", "p", "P"]);
const HANDLED_KEYS = CONTROL_KEYS;

export function bindKeyboardInput(options: KeyboardInputOptions): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key;
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
