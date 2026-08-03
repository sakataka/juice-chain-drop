import type { AiCommand, AiGameSnapshot, AiRunnerState } from "../ai";
import type { AiSpeed, DifficultyId, Fruit, GameModeId, GameState, ProgressionStage } from "../core";
import type { GameSessionCommandResult } from "../session/gameSession";
import type { GameSession } from "../session/gameSession";

export type GameInputCommand =
  | { kind: "start" }
  | { kind: "togglePause" }
  | { kind: "move"; dx: -1 | 1 }
  | { kind: "rotate" }
  | { kind: "softDrop" }
  | { kind: "hardDrop" }
  | { kind: "useJuice"; fruit: Fruit }
  | { kind: "toggleSound" }
  | { kind: "toggleSettings" }
  | { kind: "toggleAi" }
  | { kind: "setDifficulty"; difficulty: DifficultyId }
  | { kind: "setMode"; mode: GameModeId }
  | { kind: "setAiSpeed"; speed: AiSpeed }
  | { kind: "setShippingIntervalSeconds"; seconds: number }
  | { kind: "setWaterEnabled"; waterEnabled: boolean }
  | { kind: "setReducedMotion"; reducedMotion: boolean }
  | { kind: "setSfxVolume"; sfxVolume: number }
  | { kind: "setBgmVolume"; bgmVolume: number };

export type GameInputState = {
  state: ReturnType<GameSession["getRenderSnapshot"]>["state"];
  hasActivePiece: boolean;
};

type SoundControls = {
  toggle: () => void;
  syncGameState: (state: GameState, bgmStage?: ProgressionStage) => void;
  setSfxVolume: (volume: number) => void;
  setBgmVolume: (volume: number) => void;
};

type AiControls = {
  setEnabled: (enabled: boolean) => void;
  toggle: () => boolean;
  setIntervalMs: (intervalMs: number) => void;
  getState: () => AiRunnerState;
};

type GameCommandBusOptions = {
  session: GameSession;
  ai: AiControls;
  sound: SoundControls;
  applyResult: (result: GameSessionCommandResult) => void;
  updateHud: () => void;
  toggleSettings: () => void;
  unlockSound: () => void;
  aiIntervalForSpeed: (speed: AiSpeed) => number;
};

type DispatchOptions = {
  manual?: boolean;
  unlockSound?: boolean;
};

type CommandHandlers = {
  [Kind in GameInputCommand["kind"]]: (command: Extract<GameInputCommand, { kind: Kind }>) => GameSessionCommandResult | null;
};

export class GameCommandBus {
  private readonly handlers: CommandHandlers = {
    start: () => this.options.session.start(),
    togglePause: () => this.options.session.togglePause(),
    move: (command) => this.options.session.move(command.dx),
    rotate: () => this.options.session.rotate(),
    softDrop: () => this.options.session.softDrop(),
    hardDrop: () => this.options.session.hardDrop(),
    useJuice: (command) => this.options.session.useJuice(command.fruit),
    toggleSound: () => {
      this.options.sound.toggle();
      this.syncSoundGameState();
      this.options.updateHud();
      return null;
    },
    toggleSettings: () => {
      this.options.toggleSettings();
      return null;
    },
    toggleAi: () => {
      this.options.ai.toggle();
      this.options.updateHud();
      return null;
    },
    setDifficulty: (command) => this.options.session.setDifficulty(command.difficulty),
    setMode: (command) => this.options.session.setMode(command.mode),
    setAiSpeed: (command) => {
      this.options.ai.setIntervalMs(this.options.aiIntervalForSpeed(command.speed));
      return this.options.session.setAiSpeed(command.speed);
    },
    setShippingIntervalSeconds: (command) => this.options.session.setShippingIntervalSeconds(command.seconds),
    setWaterEnabled: (command) => this.options.session.setWaterEnabled(command.waterEnabled),
    setReducedMotion: (command) => this.options.session.setReducedMotion(command.reducedMotion),
    setSfxVolume: (command) => {
      this.options.sound.setSfxVolume(command.sfxVolume);
      return this.options.session.setSfxVolume(command.sfxVolume);
    },
    setBgmVolume: (command) => {
      this.options.sound.setBgmVolume(command.bgmVolume);
      return this.options.session.setBgmVolume(command.bgmVolume);
    },
  };

  constructor(private readonly options: GameCommandBusOptions) {}

  getInputState(): GameInputState {
    const snapshot = this.options.session.getRenderSnapshot();
    return {
      state: snapshot.state,
      hasActivePiece: Boolean(snapshot.active),
    };
  }

  createAiSnapshot(): AiGameSnapshot {
    const render = this.options.session.getRenderSnapshot();
    const hud = this.options.session.getHudSnapshot();
    return {
      board: render.board.map((row) => [...row]),
      active: render.active ? { kind: render.active.kind, axis: { ...render.active.axis }, satellite: { ...render.active.satellite } } : null,
      nextPreviews: render.nextPreviews.map((preview) =>
        preview.kind === "juiceDrop" ? { kind: "juiceDrop", fruit: preview.fruit } : { kind: "fruitPair", pair: [preview.pair[0], preview.pair[1]] },
      ),
      state: render.state,
      score: hud.score,
      lastChain: hud.lastChain,
      featuredFruit: hud.featuredFruit,
      juiceStock: { ...hud.juiceStock },
      juiceProgress: { ...hud.juiceProgress },
      shipment: { ...hud.shipment },
      settings: {
        mode: hud.settings.mode,
        difficulty: hud.settings.difficulty,
        shippingIntervalSeconds: hud.settings.shippingIntervalSeconds,
      },
      challenge: this.options.session.getAiChallengeContext(),
    };
  }

  dispatch(command: GameInputCommand, dispatchOptions: DispatchOptions = {}): GameSessionCommandResult | null {
    if (dispatchOptions.unlockSound) {
      this.options.unlockSound();
    }
    if (dispatchOptions.manual) {
      this.options.ai.setEnabled(false);
    }

    const result = this.execute(command);
    if (result) {
      this.options.applyResult(result);
      this.syncSoundGameState();
    }
    if (dispatchOptions.manual) {
      this.options.updateHud();
    }
    return result;
  }

  dispatchAiCommand(command: AiCommand): GameSessionCommandResult | null {
    if (command.kind === "wait") return null;
    return this.dispatch(aiCommandToInputCommand(command));
  }

  private execute(command: GameInputCommand): GameSessionCommandResult | null {
    const handler = this.handlers[command.kind];
    if (!handler) return assertNever(command as never);
    return handler(command as never);
  }

  private syncSoundGameState(): void {
    this.options.sound.syncGameState(this.options.session.getRenderSnapshot().state, this.options.session.getBgmStage());
  }
}

function aiCommandToInputCommand(command: Exclude<AiCommand, { kind: "wait" }>): GameInputCommand {
  if (command.kind === "move") return { kind: "move", dx: command.dx };
  if (command.kind === "rotate") return { kind: "rotate" };
  if (command.kind === "hardDrop") return { kind: "hardDrop" };
  if (command.kind === "useJuice") return { kind: "useJuice", fruit: command.fruit };
  return assertNever(command);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled game input command: ${JSON.stringify(value)}`);
}
