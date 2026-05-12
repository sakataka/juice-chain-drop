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
  await expect(page.getByLabel("Shipping Sec")).toHaveValue("45");
  await page.getByLabel("Shipping Sec").fill("0");
  await expect(page.getByLabel("Water Hazards")).toBeChecked();
  await page.getByLabel("Water Hazards").uncheck({ force: true });
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

test("persists settings and shows the active difficulty juice threshold", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Difficulty").selectOption("hard");
  await page.getByLabel("Mode").selectOption("waterCleanup");
  await page.getByLabel("Shipping Sec").fill("75");
  await page.getByLabel("Water Hazards").uncheck({ force: true });
  await page.getByLabel("SFX Volume").fill("35");
  await page.getByLabel("BGM Volume").fill("60");

  await page.reload();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("Difficulty")).toHaveValue("hard");
  await expect(page.getByLabel("Mode")).toHaveValue("waterCleanup");
  await expect(page.getByLabel("Shipping Sec")).toHaveValue("75");
  await expect(page.getByLabel("Water Hazards")).not.toBeChecked();
  await expect(page.getByLabel("SFX Volume")).toHaveValue("35");
  await expect(page.getByLabel("BGM Volume")).toHaveValue("60");
  await expect(page.getByRole("button", { name: /Apple Juice.*progress 0 of 5/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Berry Juice.*progress 0 of 5/ })).toBeVisible();
  await expect(page.locator('.juice-button[data-fruit="apple"] small')).toHaveText("0/5");
});

test("drops and renders water hazards in normal mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start" }).click();

  await expect
    .poll(
      async () => {
        const debug = await page.evaluate(() => window.__juiceDebug?.());
        return debug?.render.board.flat().includes("water");
      },
      { timeout: 18_000 },
    )
    .toBe(true);

  const screenshot = await page.locator("#gameCanvas").screenshot();
  expect(screenshot.length).toBeGreaterThan(1_000);
  const debug = await page.evaluate(() => window.__juiceDebug?.());
  expect(debug?.debug.lastError).toBeNull();
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

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("AI mode can start, play, and stop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("AI Speed").selectOption("fast");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "AI Off" }).click();
  await expect(page.getByRole("button", { name: "AI On" })).toBeVisible();

  await expect
    .poll(async () => Number((await page.locator("#scoreValue").textContent())?.replaceAll(",", "")), { timeout: 4_000 })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "AI On" }).click();
  await expect(page.getByRole("button", { name: "AI Off" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test("AI fast mode plays ahead without runtime errors", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("AI Speed").selectOption("fast");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "AI Off" }).click();

  await expect
    .poll(async () => Number((await page.locator("#scoreValue").textContent())?.replaceAll(",", "")), { timeout: 5_000 })
    .toBeGreaterThan(0);

  const debug = await page.evaluate(() => window.__juiceDebug?.());
  expect(debug?.ai.lastReason).toContain("Lookahead");
  expect(debug?.debug.lastError).toBeNull();
  await expect(page.locator("#gameOverOverlay")).toBeHidden();
});
