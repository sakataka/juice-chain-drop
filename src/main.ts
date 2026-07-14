import "./styles.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import { AiRunner, heuristicAiStrategy } from "./ai";
import { SoundEngine } from "./audio/sound";
import type { AiSpeed, Fruit } from "./core";
import { FRUITS } from "./core";
import { GameModel } from "./core/game";
import { GameCommandBus } from "./input/commands";
import { bindKeyboardInput } from "./input/keyboard";
import { bindTouchInput } from "./input/touch";
import { PixiGameRenderer } from "./render/pixiRenderer";
import type { GameSessionCommandResult, SoundCue, VisualEffectCue } from "./session/gameSession";
import { GameSession } from "./session/gameSession";
import { loadGameSettings, saveGameSettings } from "./storage/settings";
import { loadPlayerStats, savePlayerStats } from "./storage/stats";
import { getElement, HudController } from "./ui/hud";

type DebugState = {
  frames: number;
  dispatches: number;
  lastTickAt: number;
  lastError: string | null;
  lastResult: GameSessionCommandResult | null;
  juiceSplashes: number;
};

type SoundCueHandlers = {
  [Kind in SoundCue["kind"]]: (cue: Extract<SoundCue, { kind: Kind }>) => void;
};

type VisualEffectCueHandlers = {
  [Kind in VisualEffectCue["kind"]]: (cue: Extract<VisualEffectCue, { kind: Kind }>) => void;
};

declare global {
  interface Window {
    __juiceDebug?: () => unknown;
  }
}

const gameCanvas = getElement<HTMLCanvasElement>("#gameCanvas");
const nextCanvas = getElement<HTMLCanvasElement>("#nextCanvas");
const sound = new SoundEngine();
const renderer = new PixiGameRenderer(gameCanvas, nextCanvas);
const game = new GameModel();
const testParams = new URLSearchParams(window.location.search);
const requestedTestPress = testParams.get("testPress");
let pendingTestPress: Fruit | null = import.meta.env.DEV && testParams.has("testMode") && FRUITS.includes(requestedTestPress as Fruit) ? (requestedTestPress as Fruit) : null;
const session = new GameSession({
  game,
  settings: loadGameSettings(),
  stats: loadPlayerStats(),
  soundEnabled: () => sound.enabled,
  saveSettings: saveGameSettings,
  saveStats: savePlayerStats,
});
let inputCommands: GameCommandBus;
let hud: HudController;
const aiRunner = new AiRunner({
  getSnapshot: () => inputCommands.createAiSnapshot(),
  executeCommand: (command) => inputCommands.dispatchAiCommand(command),
  strategy: heuristicAiStrategy,
});
aiRunner.setIntervalMs(aiIntervalForSpeed(session.getSettings().aiSpeed));
const debugState: DebugState = {
  frames: 0,
  dispatches: 0,
  lastTickAt: 0,
  lastError: null,
  lastResult: null,
  juiceSplashes: 0,
};
installDebugHook();

const soundCueHandlers: SoundCueHandlers = {
  tick: () => sound.tick(),
  pop: () => sound.pop(),
  tap: () => sound.tap(),
  whoosh: (cue) => sound.whoosh(cue.strength),
  splash: (cue) => sound.splash(cue.chain, cue.fruit),
  sparkle: (cue) => sound.sparkle(cue.chain),
  pour: () => sound.pour(),
  shipment: (cue) => sound.shipment(cue.totalStock),
  fanfare: () => sound.fanfare(),
  gameOver: () => sound.gameOver(),
  bgmStage: (cue) => sound.setBgmStage(cue.stage),
};

const visualEffectCueHandlers: VisualEffectCueHandlers = {
  clearEffects: () => renderer.clearEffects(),
  juiceSplash: (cue) => renderer.spawnJuiceSplash(cue.effect, cue.primary),
  clearPop: (cue) => renderer.spawnClearPop(cue.cells, cue.fruit, cue.chain),
  waterDrop: (cue) => renderer.spawnWaterDrop(cue.cell),
  waterClear: (cue) => renderer.spawnWaterClear(cue.cells),
  shipment: (cue) => renderer.spawnShipment(cue.report),
  stageAdvance: (cue) => renderer.spawnStageAdvance(cue.stage),
};

sound.setSfxVolume(session.getSettings().sfxVolume);
sound.setBgmVolume(session.getSettings().bgmVolume);

inputCommands = new GameCommandBus({
  session,
  ai: aiRunner,
  sound,
  applyResult: dispatch,
  updateHud,
  toggleSettings: () => hud.toggleSettings(),
  unlockSound,
  aiIntervalForSpeed,
});

hud = new HudController({
  onStart: startGame,
  onSoundToggle: () => inputCommands.dispatch({ kind: "toggleSound" }),
  onTogglePause: () => inputCommands.dispatch({ kind: "togglePause" }),
  onToggleSettings: () => inputCommands.dispatch({ kind: "toggleSettings" }),
  onDifficultyChange: (difficulty) => inputCommands.dispatch({ kind: "setDifficulty", difficulty }),
  onModeChange: (mode) => inputCommands.dispatch({ kind: "setMode", mode }),
  onReducedMotionChange: (reducedMotion) => inputCommands.dispatch({ kind: "setReducedMotion", reducedMotion }),
  onSfxVolumeChange: (sfxVolume) => inputCommands.dispatch({ kind: "setSfxVolume", sfxVolume }),
  onBgmVolumeChange: (bgmVolume) => inputCommands.dispatch({ kind: "setBgmVolume", bgmVolume }),
});

bindKeyboardInput({
  getState: () => inputCommands.getInputState(),
  dispatch: (command) => inputCommands.dispatch(command, { manual: true, unlockSound: true }),
});
bindTouchInput({
  dispatch: (command) => inputCommands.dispatch(command, { manual: true, unlockSound: true }),
  buttons: {
    left: getElement<HTMLButtonElement>("#touchLeftButton"),
    right: getElement<HTMLButtonElement>("#touchRightButton"),
    rotate: getElement<HTMLButtonElement>("#touchRotateButton"),
    softDrop: getElement<HTMLButtonElement>("#touchSoftDropButton"),
    hardDrop: getElement<HTMLButtonElement>("#touchHardDropButton"),
    pause: getElement<HTMLButtonElement>("#touchPauseButton"),
  },
});

let lastTime = 0;
void boot();

async function boot(): Promise<void> {
  try {
    await renderer.init();
    updateHud();
    render();
  } catch (error) {
    recordRuntimeError("boot", error);
  } finally {
    requestAnimationFrame(tick);
  }
}

function tick(time: number): void {
  try {
    const delta = Math.min(48, time - lastTime || 16);
    lastTime = time;
    debugState.frames += 1;
    debugState.lastTickAt = performance.now();
    dispatch(session.tick(delta));
    const aiResult = aiRunner.tick(delta);
    if (aiResult) debugState.lastResult = aiResult;
  } catch (error) {
    recordRuntimeError("tick", error);
  } finally {
    requestAnimationFrame(tick);
  }
}

function dispatch(result: GameSessionCommandResult): void {
  debugState.dispatches += 1;
  debugState.lastResult = result;
  try {
    for (const cue of result.sounds) {
      playSoundCue(cue);
    }
    for (const cue of result.effects) {
      if (cue.kind === "juiceSplash") debugState.juiceSplashes += 1;
      playVisualEffect(cue);
    }
    if (result.shouldUpdateHud) {
      updateHud();
    }
    if (result.shouldRender) {
      render();
    }
  } catch (error) {
    recordRuntimeError("dispatch", error);
  }
}

function playSoundCue(cue: SoundCue): void {
  const handler = soundCueHandlers[cue.kind];
  if (!handler) return assertNever(cue as never);
  handler(cue as never);
}

function playVisualEffect(cue: VisualEffectCue): void {
  if (cue.kind === "clearEffects") {
    visualEffectCueHandlers.clearEffects(cue);
    return;
  }
  if (session.getSettings().reducedMotion) return;
  const handler = visualEffectCueHandlers[cue.kind];
  if (!handler) return assertNever(cue as never);
  handler(cue as never);
}

function updateHud(): void {
  hud.update(session.getHudSnapshot());
}

function render(): void {
  renderer.render(session.getRenderSnapshot());
}

function unlockSound(): void {
  void sound.unlock();
}

function startGame(): void {
  inputCommands.dispatch({ kind: "start" }, { unlockSound: true });
  if (!pendingTestPress) return;
  const fruit = pendingTestPress;
  pendingTestPress = null;
  const threshold = game.difficulty.juiceThreshold;
  game.awardJuice({ apple: 0, orange: 0, lemon: 0, grape: 0, melon: 0, berry: 0, [fruit]: threshold });
  updateHud();
  render();
}

function aiIntervalForSpeed(speed: AiSpeed): number {
  if (speed === "slow") return 220;
  if (speed === "fast") return 65;
  return 120;
}

function installDebugHook(): void {
  window.__juiceDebug = () => ({
    debug: { ...debugState },
    render: session.getRenderSnapshot(),
    hud: session.getHudSnapshot(),
    ai: aiRunner.getState(),
    performance: {
      memory: getMemorySnapshot(),
      now: performance.now(),
    },
  });
}

function recordRuntimeError(source: string, error: unknown): void {
  const message = error instanceof Error ? `${source}: ${error.name}: ${error.message}\n${error.stack ?? ""}` : `${source}: ${String(error)}`;
  debugState.lastError = message;
  console.error("[Juice Chain Drop]", message);
}

function getMemorySnapshot(): unknown {
  const performanceWithMemory = performance as Performance & { memory?: unknown };
  return performanceWithMemory.memory ?? null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled cue: ${JSON.stringify(value)}`);
}
