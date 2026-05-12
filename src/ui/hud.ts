import fruitStripUrl from "../assets/sprites/lab/fruits-v2.png";
import juiceStripUrl from "../assets/sprites/lab/juices-v2.png";
import { DIFFICULTY_CONFIGS, FRUIT_COLORS, FRUIT_LABEL, FRUITS, GAME_MODE_CONFIGS, JUICE_EFFECT_LABEL, NORMAL_KEYS } from "../core";
import type { AiSpeed, DifficultyId, Fruit, FruitRecord, GameModeId, GameSettings, GameState, JuiceOrder } from "../core";
import type { AiRunnerState } from "../ai";
import type { PlayerStats } from "../storage/stats";

export type HudSnapshot = {
  score: number;
  lastChain: number;
  state: GameState;
  juiceStock: FruitRecord;
  juiceProgress: FruitRecord;
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
  onShippingIntervalChange: (seconds: number) => void;
  onWaterEnabledChange: (enabled: boolean) => void;
  onReducedMotionChange: (enabled: boolean) => void;
  onSfxVolumeChange: (volume: number) => void;
  onBgmVolumeChange: (volume: number) => void;
  onJuice: (fruit: Fruit) => void;
};

type JuiceButtonElements = {
  button: HTMLButtonElement;
  key: HTMLSpanElement;
  icon: HTMLSpanElement;
  name: HTMLSpanElement;
  effect: HTMLSpanElement;
  stock: HTMLElement;
  progress: HTMLElement;
};

const JUICE_EFFECT_COMPACT_LABEL: Record<Fruit, string> = {
  apple: "Burst",
  orange: "Line",
  lemon: "Shift",
  grape: "Vine",
  melon: "Chill",
  berry: "Seed",
};

const SPRITE_BACKGROUND_SIZE = "600% 100%";

export class HudController {
  private readonly scoreValue = getElement<HTMLElement>("#scoreValue");
  private readonly chainValue = getElement<HTMLElement>("#chainValue");
  private readonly bestScoreValue = getElement<HTMLElement>("#bestScoreValue");
  private readonly bestChainValue = getElement<HTMLElement>("#bestChainValue");
  private readonly featuredFruitValue = getElement<HTMLElement>("#featuredFruitValue");
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
  private readonly shippingIntervalInput = getElement<HTMLInputElement>("#shippingIntervalInput");
  private readonly waterEnabledToggle = getElement<HTMLInputElement>("#waterEnabledToggle");
  private readonly shipmentRemainingValue = getElement<HTMLElement>("#shipmentRemainingValue");
  private readonly orderValue = getElement<HTMLElement>("#orderValue");
  private readonly juiceInventory = getElement<HTMLElement>("#juiceInventory");
  private readonly juiceButtons = new Map<Fruit, JuiceButtonElements>();

  constructor(callbacks: HudCallbacks) {
    this.juiceInventory.replaceChildren();
    for (const fruit of FRUITS) {
      const button = document.createElement("button");
      button.className = "juice-button";
      button.type = "button";
      button.dataset.fruit = fruit;
      bindPress(button, () => callbacks.onJuice(fruit));
      const elements = createJuiceButtonElements(button);
      this.juiceButtons.set(fruit, elements);
      this.juiceInventory.append(button);
    }

    bindPress(this.startButton, callbacks.onStart);
    bindPress(this.retryButton, callbacks.onStart);
    bindPress(this.resumeButton, callbacks.onTogglePause);
    bindPress(this.soundButton, callbacks.onSoundToggle);
    bindPress(this.settingsButton, callbacks.onToggleSettings);
    bindPress(this.aiToggleButton, callbacks.onToggleAi);
    bindPress(this.pauseButton, callbacks.onTogglePause);
    this.difficultySelect.addEventListener("change", () => {
      callbacks.onDifficultyChange(this.difficultySelect.value as DifficultyId);
    });
    this.modeSelect.addEventListener("change", () => {
      callbacks.onModeChange(this.modeSelect.value as GameModeId);
    });
    this.aiSpeedSelect.addEventListener("change", () => {
      callbacks.onAiSpeedChange(this.aiSpeedSelect.value as AiSpeed);
    });
    this.shippingIntervalInput.addEventListener("input", () => {
      callbacks.onShippingIntervalChange(Number(this.shippingIntervalInput.value));
    });
    this.waterEnabledToggle.addEventListener("change", () => {
      callbacks.onWaterEnabledChange(this.waterEnabledToggle.checked);
    });
    this.reducedMotionToggle.addEventListener("change", () => {
      callbacks.onReducedMotionChange(this.reducedMotionToggle.checked);
    });
    this.sfxVolumeInput.addEventListener("input", () => {
      callbacks.onSfxVolumeChange(Number(this.sfxVolumeInput.value) / 100);
    });
    this.bgmVolumeInput.addEventListener("input", () => {
      callbacks.onBgmVolumeChange(Number(this.bgmVolumeInput.value) / 100);
    });
  }

  update(snapshot: HudSnapshot): void {
    const ai = snapshot.ai ?? { enabled: false, intervalMs: 120, pendingCommands: 0, lastReason: "Off" };
    const juiceThreshold = DIFFICULTY_CONFIGS[snapshot.settings.difficulty].juiceThreshold;
    this.scoreValue.textContent = snapshot.score.toLocaleString();
    this.scoreValue.dataset.scoreSize = getScoreSize(snapshot.score);
    this.chainValue.textContent = String(snapshot.lastChain);
    this.bestScoreValue.textContent = snapshot.stats.bestScore.toLocaleString();
    this.bestChainValue.textContent = String(snapshot.stats.bestChain);
    this.featuredFruitValue.replaceChildren(createFruitIcon(snapshot.featuredFruit, "fruit-status-icon"));
    this.featuredFruitValue.title = FRUIT_LABEL[snapshot.featuredFruit];
    this.featuredFruitValue.style.color = FRUIT_COLORS[snapshot.featuredFruit];
    this.difficultySelect.value = snapshot.settings.difficulty;
    this.difficultySelect.title = getDifficultyTitle(snapshot.settings.difficulty);
    this.modeSelect.value = snapshot.settings.mode;
    this.modeSelect.title = GAME_MODE_CONFIGS[snapshot.settings.mode].description;
    this.aiSpeedSelect.value = snapshot.settings.aiSpeed;
    this.shippingIntervalInput.value = String(snapshot.settings.shippingIntervalSeconds);
    this.waterEnabledToggle.checked = snapshot.settings.waterEnabled;
    this.reducedMotionToggle.checked = snapshot.settings.reducedMotion;
    this.sfxVolumeInput.value = String(Math.round(snapshot.settings.sfxVolume * 100));
    this.bgmVolumeInput.value = String(Math.round(snapshot.settings.bgmVolume * 100));
    this.modeValue.textContent = snapshot.challenge.label;
    this.modeValue.title = snapshot.challenge.progress;
    this.challengeProgressValue.textContent = DIFFICULTY_CONFIGS[snapshot.settings.difficulty].label;
    this.challengeProgressValue.title = getDifficultyTitle(snapshot.settings.difficulty);
    this.challengeResultValue.textContent = snapshot.challenge.result;
    this.shipmentRemainingValue.textContent = snapshot.shipment.enabled ? `${Math.ceil(snapshot.shipment.remainingMs / 1000)}s` : "Off";
    this.shipmentRemainingValue.title = snapshot.shipment.enabled ? `Ships every ${snapshot.shipment.intervalSeconds}s` : "Shipping disabled";
    this.orderValue.replaceChildren(...createOrderIcons(snapshot.order));
    this.orderValue.title = `Order bonus +${snapshot.order.bonusScore.toLocaleString()}`;
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
    setButtonContent(this.soundButton, snapshot.soundEnabled ? "♪" : "♪", snapshot.soundEnabled ? "Sound on" : "Sound off");
    this.soundButton.title = snapshot.soundEnabled ? "Sound on" : "Sound off";
    this.soundButton.setAttribute("aria-pressed", String(snapshot.soundEnabled));
    setButtonContent(this.aiToggleButton, "AI", ai.enabled ? "AI on" : "AI off");
    this.aiToggleButton.title = ai.enabled ? "AI on" : "AI off";
    this.aiToggleButton.setAttribute("aria-pressed", String(ai.enabled));
    this.settingsButton.title = this.settingsPanel.hidden ? "Settings" : "Close settings";

    for (const fruit of FRUITS) {
      const elements = this.juiceButtons.get(fruit);
      if (!elements) continue;
      elements.button.disabled = snapshot.state !== "playing" || snapshot.juiceStock[fruit] <= 0;
      elements.button.title = `${FRUIT_LABEL[fruit]} Juice: ${JUICE_EFFECT_LABEL[fruit]}`;
      elements.button.setAttribute("aria-label", `${FRUIT_LABEL[fruit]} Juice, ${JUICE_EFFECT_LABEL[fruit]}, stock ${snapshot.juiceStock[fruit]}, progress ${snapshot.juiceProgress[fruit]} of ${juiceThreshold}`);
      elements.key.textContent = NORMAL_KEYS[fruit];
      elements.name.textContent = "";
      elements.effect.textContent = JUICE_EFFECT_COMPACT_LABEL[fruit];
      elements.stock.textContent = String(snapshot.juiceStock[fruit]);
      elements.progress.textContent = `${snapshot.juiceProgress[fruit]}/${juiceThreshold}`;
      elements.button.style.setProperty("--accent", FRUIT_COLORS[fruit]);
      elements.icon.style.backgroundImage = `url("${juiceStripUrl}")`;
      elements.icon.style.backgroundSize = SPRITE_BACKGROUND_SIZE;
      elements.icon.style.backgroundPosition = getSpriteBackgroundPosition(fruit);
    }
  }

  toggleSettings(): void {
    const nextHidden = !this.settingsPanel.hidden;
    this.settingsPanel.hidden = nextHidden;
    this.settingsButton.setAttribute("aria-expanded", String(!nextHidden));
    this.settingsButton.title = nextHidden ? "Settings" : "Close settings";
  }
}

function createJuiceButtonElements(button: HTMLButtonElement): JuiceButtonElements {
  const key = document.createElement("span");
  key.className = "juice-key";
  const icon = document.createElement("span");
  icon.className = "juice-icon";
  icon.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "juice-name";
  const effect = document.createElement("span");
  effect.className = "juice-effect";
  const stock = document.createElement("strong");
  const progress = document.createElement("small");

  button.append(key, icon, name, effect, stock, progress);
  return { button, key, icon, name, effect, stock, progress };
}

function createOrderIcons(order: JuiceOrder): HTMLElement[] {
  return FRUITS.flatMap((fruit) => {
    const count = order.requirements[fruit];
    if (count <= 0) return [];
    const item = document.createElement("span");
    item.className = "order-item";
    item.title = `${FRUIT_LABEL[fruit]} juice x${count}`;
    item.append(createJuiceIcon(fruit, "order-juice-icon"), createCountBadge(count));
    return [item];
  });
}

function createCountBadge(count: number): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "order-count";
  badge.textContent = `x${count}`;
  return badge;
}

function createFruitIcon(fruit: Fruit, className: string): HTMLElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-label", FRUIT_LABEL[fruit]);
  icon.style.backgroundImage = `url("${fruitStripUrl}")`;
  icon.style.backgroundSize = SPRITE_BACKGROUND_SIZE;
  icon.style.backgroundPosition = getSpriteBackgroundPosition(fruit);
  return icon;
}

function createJuiceIcon(fruit: Fruit, className: string): HTMLElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.setAttribute("aria-label", `${FRUIT_LABEL[fruit]} juice`);
  icon.style.backgroundImage = `url("${juiceStripUrl}")`;
  icon.style.backgroundSize = SPRITE_BACKGROUND_SIZE;
  icon.style.backgroundPosition = getSpriteBackgroundPosition(fruit);
  return icon;
}

function getSpriteBackgroundPosition(fruit: Fruit): string {
  return `${FRUITS.indexOf(fruit) * 20}% center`;
}

function getDifficultyTitle(difficulty: DifficultyId): string {
  const config = DIFFICULTY_CONFIGS[difficulty];
  return `${config.label}: drop ${config.dropInterval}ms, water ${config.waterBurst.min}-${config.waterBurst.max} every ${Math.round(config.waterIntervalMs.min / 1000)}-${Math.round(config.waterIntervalMs.max / 1000)}s, juice every ${config.juiceThreshold}`;
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
  if (!element) {
    throw new Error(`Juice Chain Drop could not find ${selector}.`);
  }
  return element;
}
