import fruitStripUrl from "../assets/sprites/lab/fruits-v2.png";
import juiceStripUrl from "../assets/sprites/lab/juices-v2.png";
import { DIFFICULTY_CONFIGS, FRUIT_COLORS, FRUIT_LABEL, FRUITS, GAME_MODE_CONFIGS, JUICE_EFFECT_LABEL } from "../core";
import type { AiSpeed, DifficultyId, Fruit, FruitRecord, GameModeId, GameSettings, GameState, JuiceOrder } from "../core";
import type { AiRunnerState } from "../ai";
import type { PlayerStats } from "../storage/stats";

export type HudSnapshot = {
  score: number;
  lastChain: number;
  state: GameState;
  juiceStock: FruitRecord;
  juiceProgress: FruitRecord;
  juiceDropsCreated: number;
  queuedJuiceDrops: Fruit[];
  shipment: {
    enabled: boolean;
    intervalSeconds: number;
    remainingMs: number;
    previewScore: number;
  };
  order: JuiceOrder;
  featuredFruit: Fruit;
  soundEnabled: boolean;
  stats: PlayerStats;
  settings: GameSettings;
  ai?: AiRunnerState;
  challenge: {
    label: string;
    progress: string;
    result: string;
    resultKicker: string;
    resultTitle: string;
    resultDetailLabel: string;
    resultDetailValue: string;
  };
};

type HudCallbacks = {
  onStart: () => void;
  onSoundToggle: () => void;
  onTogglePause: () => void;
  onToggleSettings: () => void;
  onToggleAi: () => void;
  onDifficultyChange: (difficulty: DifficultyId) => void;
  onModeChange: (mode: GameModeId) => void;
  onAiSpeedChange: (speed: AiSpeed) => void;
  onReducedMotionChange: (enabled: boolean) => void;
  onSfxVolumeChange: (volume: number) => void;
  onBgmVolumeChange: (volume: number) => void;
};

type PressLaneElements = {
  lane: HTMLElement;
  fruitIcon: HTMLElement;
  juiceIcon: HTMLElement;
  fill: HTMLElement;
  progress: HTMLElement;
  queued: HTMLElement;
};

const SPRITE_BACKGROUND_SIZE = "600% 100%";

export class HudController {
  private readonly scoreValue = getElement<HTMLElement>("#scoreValue");
  private readonly chainValue = getElement<HTMLElement>("#chainValue");
  private readonly bestScoreValue = getElement<HTMLElement>("#bestScoreValue");
  private readonly bestChainValue = getElement<HTMLElement>("#bestChainValue");
  private readonly juiceDropsValue = getElement<HTMLElement>("#juiceDropsValue");
  private readonly pauseOverlay = getElement<HTMLElement>("#pauseOverlay");
  private readonly difficultySelect = getElement<HTMLSelectElement>("#difficultySelect");
  private readonly modeSelect = getElement<HTMLSelectElement>("#modeSelect");
  private readonly reducedMotionToggle = getElement<HTMLInputElement>("#reducedMotionToggle");
  private readonly sfxVolumeInput = getElement<HTMLInputElement>("#sfxVolumeInput");
  private readonly bgmVolumeInput = getElement<HTMLInputElement>("#bgmVolumeInput");
  private readonly gameOverOverlay = getElement<HTMLElement>("#gameOverOverlay");
  private readonly gameOverKicker = getElement<HTMLElement>("#gameOverKicker");
  private readonly gameOverTitle = getElement<HTMLElement>("#gameOverTitle");
  private readonly finalScoreLabel = getElement<HTMLElement>("#finalScoreLabel");
  private readonly finalScoreValue = getElement<HTMLElement>("#finalScoreValue");
  private readonly startButton = getElement<HTMLButtonElement>("#startButton");
  private readonly retryButton = getElement<HTMLButtonElement>("#retryButton");
  private readonly resumeButton = getElement<HTMLButtonElement>("#resumeButton");
  private readonly soundButton = getElement<HTMLButtonElement>("#soundButton");
  private readonly settingsButton = getElement<HTMLButtonElement>("#settingsButton");
  private readonly aiToggleButton = getElement<HTMLButtonElement>("#aiToggleButton");
  private readonly pauseButton = getElement<HTMLButtonElement>("#pauseButton");
  private readonly touchPauseButton = getElement<HTMLButtonElement>("#touchPauseButton");
  private readonly settingsPanel = getElement<HTMLElement>("#settingsPanel");
  private readonly modeValue = getElement<HTMLElement>("#modeValue");
  private readonly challengeProgressValue = getElement<HTMLElement>("#challengeProgressValue");
  private readonly challengeResultValue = getElement<HTMLElement>("#challengeResultValue");
  private readonly aiSpeedSelect = getElement<HTMLSelectElement>("#aiSpeedSelect");
  private readonly pressTank = getElement<HTMLElement>("#pressTank");
  private readonly pressLanes = new Map<Fruit, PressLaneElements>();

  constructor(callbacks: HudCallbacks) {
    this.pressTank.replaceChildren();
    for (const fruit of FRUITS) {
      const elements = createPressLane(fruit);
      this.pressLanes.set(fruit, elements);
      this.pressTank.append(elements.lane);
    }

    bindPress(this.startButton, callbacks.onStart);
    bindPress(this.retryButton, callbacks.onStart);
    bindPress(this.resumeButton, callbacks.onTogglePause);
    bindPress(this.soundButton, callbacks.onSoundToggle);
    bindPress(this.settingsButton, callbacks.onToggleSettings);
    bindPress(this.aiToggleButton, callbacks.onToggleAi);
    bindPress(this.pauseButton, callbacks.onTogglePause);
    this.difficultySelect.addEventListener("change", () => callbacks.onDifficultyChange(this.difficultySelect.value as DifficultyId));
    this.modeSelect.addEventListener("change", () => callbacks.onModeChange(this.modeSelect.value as GameModeId));
    this.aiSpeedSelect.addEventListener("change", () => callbacks.onAiSpeedChange(this.aiSpeedSelect.value as AiSpeed));
    this.reducedMotionToggle.addEventListener("change", () => callbacks.onReducedMotionChange(this.reducedMotionToggle.checked));
    this.sfxVolumeInput.addEventListener("input", () => callbacks.onSfxVolumeChange(Number(this.sfxVolumeInput.value) / 100));
    this.bgmVolumeInput.addEventListener("input", () => callbacks.onBgmVolumeChange(Number(this.bgmVolumeInput.value) / 100));
  }

  update(snapshot: HudSnapshot): void {
    const ai = snapshot.ai ?? { enabled: false, intervalMs: 120, pendingCommands: 0, lastReason: "AI standby" };
    const juiceThreshold = DIFFICULTY_CONFIGS[snapshot.settings.difficulty].juiceThreshold;
    this.scoreValue.textContent = snapshot.score.toLocaleString();
    this.scoreValue.dataset.scoreSize = getScoreSize(snapshot.score);
    this.chainValue.textContent = String(snapshot.lastChain);
    this.bestScoreValue.textContent = snapshot.stats.bestScore.toLocaleString();
    this.bestChainValue.textContent = String(snapshot.stats.bestChain);
    this.juiceDropsValue.textContent = String(snapshot.juiceDropsCreated);
    this.difficultySelect.value = snapshot.settings.difficulty;
    this.difficultySelect.title = getDifficultyTitle(snapshot.settings.difficulty);
    this.modeSelect.value = snapshot.settings.mode;
    this.modeSelect.title = GAME_MODE_CONFIGS[snapshot.settings.mode].description;
    this.aiSpeedSelect.value = snapshot.settings.aiSpeed;
    this.reducedMotionToggle.checked = snapshot.settings.reducedMotion;
    this.sfxVolumeInput.value = String(Math.round(snapshot.settings.sfxVolume * 100));
    this.bgmVolumeInput.value = String(Math.round(snapshot.settings.bgmVolume * 100));
    this.modeValue.textContent = snapshot.challenge.label;
    this.modeValue.title = snapshot.challenge.progress;
    this.challengeProgressValue.textContent = DIFFICULTY_CONFIGS[snapshot.settings.difficulty].label;
    this.challengeProgressValue.title = getDifficultyTitle(snapshot.settings.difficulty);
    this.challengeResultValue.textContent = snapshot.challenge.result;
    this.gameOverKicker.textContent = snapshot.challenge.resultKicker;
    this.gameOverTitle.textContent = snapshot.challenge.resultTitle;
    this.finalScoreLabel.textContent = snapshot.challenge.resultDetailLabel;
    this.finalScoreValue.textContent = snapshot.challenge.resultDetailValue;
    this.gameOverOverlay.hidden = snapshot.state !== "gameover";
    this.gameOverOverlay.setAttribute("aria-hidden", String(snapshot.state !== "gameover"));
    this.pauseOverlay.hidden = snapshot.state !== "paused";
    this.pauseOverlay.setAttribute("aria-hidden", String(snapshot.state !== "paused"));
    setButtonContent(this.startButton, snapshot.state === "playing" ? "↻" : "▶", snapshot.state === "playing" ? "Restart" : snapshot.state === "gameover" ? "Retry" : "Start");
    setButtonContent(this.pauseButton, snapshot.state === "paused" ? "▶" : "Ⅱ", snapshot.state === "paused" ? "Resume" : "Pause");
    this.touchPauseButton.textContent = snapshot.state === "paused" ? "Resume" : "Pause";
    this.pauseButton.disabled = snapshot.state !== "playing" && snapshot.state !== "paused";
    this.touchPauseButton.disabled = snapshot.state !== "playing" && snapshot.state !== "paused";
    setButtonContent(this.soundButton, "♪", snapshot.soundEnabled ? "Sound on" : "Sound off");
    this.soundButton.title = snapshot.soundEnabled ? "Sound on" : "Sound off";
    this.soundButton.setAttribute("aria-pressed", String(snapshot.soundEnabled));
    setButtonContent(this.aiToggleButton, "AI", ai.enabled ? "AI Playing" : "Auto Play");
    this.aiToggleButton.title = ai.enabled ? `Auto Play on: ${ai.lastReason}` : "Start Auto Play";
    this.aiToggleButton.setAttribute("aria-pressed", String(ai.enabled));
    this.settingsButton.title = this.settingsPanel.hidden ? "Settings" : "Close settings";

    for (const fruit of FRUITS) {
      const elements = this.pressLanes.get(fruit);
      if (!elements) continue;
      const progress = snapshot.juiceProgress[fruit];
      const queued = snapshot.queuedJuiceDrops.filter((queuedFruit) => queuedFruit === fruit).length;
      const ratio = Math.min(1, progress / juiceThreshold);
      elements.lane.style.setProperty("--accent", FRUIT_COLORS[fruit]);
      elements.lane.setAttribute("aria-label", `${FRUIT_LABEL[fruit]} press ${progress} of ${juiceThreshold}; ${queued} bottle${queued === 1 ? "" : "s"} queued`);
      elements.lane.setAttribute("aria-valuenow", String(progress));
      elements.lane.setAttribute("aria-valuemax", String(juiceThreshold));
      elements.fill.style.width = `${ratio * 100}%`;
      elements.progress.textContent = `${progress}/${juiceThreshold}`;
      elements.queued.textContent = queued > 0 ? `NEXT ×${queued}` : JUICE_EFFECT_LABEL[fruit].replace(`${FRUIT_LABEL[fruit]}: `, "");
      elements.queued.classList.toggle("is-ready", queued > 0);
    }
  }

  toggleSettings(): void {
    const nextHidden = !this.settingsPanel.hidden;
    this.settingsPanel.hidden = nextHidden;
    this.settingsButton.setAttribute("aria-expanded", String(!nextHidden));
    this.settingsButton.title = nextHidden ? "Settings" : "Close settings";
  }
}

function createPressLane(fruit: Fruit): PressLaneElements {
  const lane = document.createElement("div");
  lane.className = "press-lane";
  lane.dataset.fruit = fruit;
  lane.setAttribute("role", "progressbar");
  lane.setAttribute("aria-valuemin", "0");

  const fruitIcon = createSpriteIcon(fruit, fruitStripUrl, "press-fruit-icon");
  const flow = document.createElement("span");
  flow.className = "press-flow";
  flow.textContent = "›";
  flow.setAttribute("aria-hidden", "true");
  const juiceIcon = createSpriteIcon(fruit, juiceStripUrl, "press-juice-icon");
  const copy = document.createElement("span");
  copy.className = "press-copy";
  const label = document.createElement("strong");
  label.textContent = FRUIT_LABEL[fruit];
  const queued = document.createElement("small");
  copy.append(label, queued);
  const meter = document.createElement("span");
  meter.className = "press-meter";
  const fill = document.createElement("span");
  fill.className = "press-meter-fill";
  meter.append(fill);
  const progress = document.createElement("b");
  progress.className = "press-progress";
  lane.append(fruitIcon, flow, juiceIcon, copy, meter, progress);
  return { lane, fruitIcon, juiceIcon, fill, progress, queued };
}

function createSpriteIcon(fruit: Fruit, url: string, className: string): HTMLElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-hidden", "true");
  icon.style.backgroundImage = `url("${url}")`;
  icon.style.backgroundSize = SPRITE_BACKGROUND_SIZE;
  icon.style.backgroundPosition = getSpriteBackgroundPosition(fruit);
  return icon;
}

function getSpriteBackgroundPosition(fruit: Fruit): string {
  return `${FRUITS.indexOf(fruit) * 20}% center`;
}

function getDifficultyTitle(difficulty: DifficultyId): string {
  const config = DIFFICULTY_CONFIGS[difficulty];
  return `${config.label}: drop ${config.dropInterval}ms, bottle every ${config.juiceThreshold} cleared fruit`;
}

function setButtonContent(button: HTMLButtonElement, icon: string, label: string): void {
  button.replaceChildren();
  const iconElement = document.createElement("span");
  iconElement.className = "button-icon";
  iconElement.setAttribute("aria-hidden", "true");
  iconElement.textContent = icon;
  const labelElement = document.createElement("span");
  labelElement.className = "button-label";
  labelElement.textContent = label;
  button.append(iconElement, labelElement);
}

function bindPress(button: HTMLButtonElement, callback: () => void): void {
  let handledPointer = false;
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    handledPointer = true;
    event.preventDefault();
    callback();
  });
  button.addEventListener("click", () => {
    if (handledPointer) {
      handledPointer = false;
      return;
    }
    callback();
  });
}

function getScoreSize(score: number): "normal" | "long" | "wide" {
  const digits = Math.max(1, Math.floor(Math.max(0, score))).toLocaleString().length;
  if (digits >= 10) return "wide";
  if (digits >= 7) return "long";
  return "normal";
}

export function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Juice Chain Drop could not find ${selector}.`);
  return element;
}
