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
  await page.getByLabel("SFX Volume").fill("35");
  await page.getByLabel("BGM Volume").fill("60");

  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Difficulty")).toHaveValue("hard");
  await expect(page.getByLabel("Mode")).toHaveValue("waterCleanup");
  await expect(page.getByLabel("SFX Volume")).toHaveValue("35");
  await expect(page.getByLabel("BGM Volume")).toHaveValue("60");
  await expect(page.locator('.press-lane[data-fruit="apple"]')).toHaveAttribute("aria-valuemax", "5");
  await expect(page.locator('.press-lane[data-fruit="berry"]')).toHaveAttribute("aria-valuemax", "5");
  await expect(page.locator('.press-lane[data-fruit="apple"] .press-progress')).toHaveText("0/5");
});

test("keeps the core screen focused on Press Tank without shipping or AI controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Press Tank" })).toBeVisible();
  await expect(page.locator(".press-lane")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Shipping" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /AI/ })).toHaveCount(0);
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
    const ids = ["startButton", "gameCanvas", "touchLeftButton", "touchRotateButton", "touchRightButton", "touchSoftDropButton", "touchHardDropButton", "touchPauseButton"];
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
