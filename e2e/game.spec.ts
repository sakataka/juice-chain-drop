import { expect, test } from "@playwright/test";

test("starts the PixiJS game and renders a non-empty canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Juice Chain Drop" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();

  const gameCanvas = page.locator("#gameCanvas");
  const nextCanvas = page.locator("#nextCanvas");
  await expect(gameCanvas).toBeVisible();
  await expect(nextCanvas).toBeVisible();
  const screenshot = await gameCanvas.screenshot();
  const nextScreenshot = await nextCanvas.screenshot();
  expect(screenshot.length).toBeGreaterThan(1_000);
  expect(nextScreenshot.length).toBeGreaterThan(1_000);

  if ((page.viewportSize()?.width ?? 0) >= 900) {
    const gameStage = await page.locator(".game-stage").boundingBox();
    const sidePanel = await page.locator(".side-panel").boundingBox();
    expect(gameStage).not.toBeNull();
    expect(sidePanel).not.toBeNull();
    expect(sidePanel!.height).toBeLessThanOrEqual(gameStage!.height + 4);
  }

  await expect(page.locator("#gameOverOverlay")).toBeHidden();
});

test("toggles sound and keeps the layout within the viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sound On" })).toBeVisible();
  await page.getByRole("button", { name: "Sound On" }).click();
  await expect(page.getByRole("button", { name: "Sound Off" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("opens settings and pauses with keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Difficulty")).toBeVisible();
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByLabel("Mode").selectOption("chainChallenge");
  await page.getByLabel("Auto Play Pace").selectOption("fast");
  await expect(page.getByLabel("Reduced Effects")).toBeVisible();
  await page.getByLabel("Reduced Effects").check({ force: true });
  await page.getByLabel("SFX Volume").fill("35");
  await page.getByLabel("BGM Volume").fill("60");

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Chain Challenge").first()).toBeVisible();
  await page.keyboard.press("KeyP");
  await expect(page.getByText("Paused").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pauseOverlay")).toBeHidden();
});

test("persists settings and shows the active difficulty press threshold", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByLabel("Mode").selectOption("waterCleanup");
  await page.getByLabel("Auto Play Pace").selectOption("slow");
  await page.getByLabel("SFX Volume").fill("35");
  await page.getByLabel("BGM Volume").fill("60");

  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Difficulty")).toHaveValue("hard");
  await expect(page.getByLabel("Mode")).toHaveValue("waterCleanup");
  await expect(page.getByLabel("Auto Play Pace")).toHaveValue("slow");
  await expect(page.getByLabel("SFX Volume")).toHaveValue("35");
  await expect(page.getByLabel("BGM Volume")).toHaveValue("60");
  await expect(page.locator('.press-lane[data-fruit="apple"]')).toHaveAttribute("aria-valuemax", "5");
  await expect(page.locator('.press-lane[data-fruit="berry"]')).toHaveAttribute("aria-valuemax", "5");
  await expect(page.locator('.press-lane[data-fruit="apple"] .press-progress')).toHaveText("0/5");
});

test("keeps the core screen focused on Press Tank with a dedicated Auto Play control", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Press Tank" })).toBeVisible();
  await expect(page.locator(".press-lane")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Shipping" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Auto Play" })).toBeVisible();
});

test("starts Auto Play in one action and returns control on manual input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Auto Play" }).click();

  await expect(page.getByRole("button", { name: "AI Playing" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.render.state).toBe("playing");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.ai.lastReason).not.toBe("AI standby");

  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("button", { name: "Auto Play" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.ai.enabled).toBe(false);
});

test("keeps fast Chain Challenge Auto Play responsive during sustained search", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Mode").selectOption("chainChallenge");
  await page.getByLabel("Auto Play Pace").selectOption("fast");
  await page.getByRole("button", { name: "Auto Play" }).click();
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.ai.decisionCount).toBeGreaterThanOrEqual(5);
  const before = await page.evaluate(() => window.__juiceDebug?.() as any);

  await page.waitForTimeout(4_000);

  const after = await page.evaluate(() => window.__juiceDebug?.() as any);
  expect(after.debug.frames - before.debug.frames).toBeGreaterThan(60);
  expect(after.ai.decisionCount).toBeGreaterThan(before.ai.decisionCount);
  expect(after.ai.maxDecisionMs).toBeLessThan(250);
  expect(after.ai.chainPotentialEvaluations).toBeLessThanOrEqual(24);
  expect(after.debug.lastError).toBeNull();
});

test("puts a completed bottle into Next and bursts it on landing", async ({ page }) => {
  await page.goto("/?testMode=1&testPress=apple");
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.locator('.press-lane[data-fruit="apple"] small')).toHaveText("NEXT ×1");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.render.nextPreviews[0]).toEqual({ kind: "juiceDrop", fruit: "apple" });

  await page.keyboard.press("Space");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.render.active?.kind).toBe("juiceDrop");

  await page.keyboard.press("Space");
  await expect.poll(async () => (await page.evaluate(() => window.__juiceDebug?.() as any))?.debug.juiceSplashes).toBeGreaterThan(0);
  const splashFrame = await page.locator("#gameCanvas").screenshot();
  expect(splashFrame.length).toBeGreaterThan(1_000);
});

test("does not restart an active game when Enter is pressed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();
  await page.keyboard.press("Space");

  const scoreAfterDrop = Number((await page.locator("#scoreValue").textContent())?.replaceAll(",", ""));
  expect(scoreAfterDrop).toBeGreaterThan(0);

  await page.keyboard.press("Enter");

  await expect(page.locator("#scoreValue")).toHaveText(scoreAfterDrop.toLocaleString());
  await expect(page.locator("#gameOverOverlay")).toBeHidden();
  await expect(page.getByRole("button", { name: "Restart" })).toBeVisible();
});

test("touch controls operate without mobile overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Move left" }).click();
  await page.getByRole("button", { name: "Rotate" }).click();
  await page.getByRole("button", { name: "Soft drop" }).click();
  await page.getByRole("button", { name: "Hard drop" }).click();
  await page.getByRole("button", { name: "Pause or resume" }).click();
  await expect(page.getByText("Paused").first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("keeps mobile start and touch controls in the first viewport", async ({ page }) => {
  await page.goto("/");
  const viewport = page.viewportSize();
  test.skip(!viewport || viewport.width > 480, "mobile viewport only");

  const controlBoxes = await page.evaluate(() => {
    const ids = ["startButton", "aiToggleButton", "gameCanvas", "touchLeftButton", "touchRotateButton", "touchRightButton", "touchSoftDropButton", "touchHardDropButton", "touchPauseButton"];
    return ids.map((id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return rect ? { id, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
    });
  });

  for (const box of controlBoxes) {
    expect(box).not.toBeNull();
    expect(box!.top).toBeGreaterThanOrEqual(0);
    expect(box!.bottom).toBeLessThanOrEqual(viewport.height);
    expect(box!.left).toBeGreaterThanOrEqual(0);
    expect(box!.right).toBeLessThanOrEqual(viewport.width);
  }

  const touchHeights = await page.locator(".touch-controls button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(touchHeights.every((height) => height >= 44)).toBe(true);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("shows keyboard focus and honors dark and reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  const startButton = page.getByRole("button", { name: "Start" });
  await expect(startButton).toBeFocused();

  const preferenceStyles = await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("#startButton");
    const scoreValue = document.querySelector<HTMLElement>("#scoreValue");
    if (!button || !scoreValue) throw new Error("Expected UI elements were not rendered.");
    const buttonStyle = getComputedStyle(button);
    const scoreStyle = getComputedStyle(scoreValue);
    return {
      darkMode: matchMedia("(prefers-color-scheme: dark)").matches,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      focusOutline: buttonStyle.outlineStyle,
      focusOutlineWidth: Number.parseFloat(buttonStyle.outlineWidth),
      scoreColor: scoreStyle.color,
    };
  });

  expect(preferenceStyles).toMatchObject({
    darkMode: true,
    reducedMotion: true,
    colorScheme: "dark",
    focusOutline: "solid",
    scoreColor: "rgb(255, 192, 100)",
  });
  expect(preferenceStyles.focusOutlineWidth).toBeGreaterThanOrEqual(3);

  await page.getByRole("button", { name: "Settings" }).click();
  const panelAnimationDuration = await page.locator("#settingsPanel").evaluate((panel) => Number.parseFloat(getComputedStyle(panel).animationDuration));
  expect(panelAnimationDuration).toBeLessThan(0.01);
});
