import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.JUICE_GAME_URL ?? "http://127.0.0.1:4178/juice-chain-drop/";
const outputDir = path.resolve("assets/screenshots");

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function save(name) {
  await page.screenshot({
    path: path.join(outputDir, name),
    fullPage: false,
    animations: "disabled",
  });
}

const testUrl = new URL(baseUrl);
testUrl.searchParams.set("testMode", "1");
testUrl.searchParams.set("testPress", "apple");

await page.goto(testUrl.href, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#gameCanvas");
await save("title.png");

await page.getByRole("button", { name: "Auto Play" }).click();
await page.waitForTimeout(700);
await save("gameplay-start.png");

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#gameCanvas");
await page.getByRole("button", { name: "Start" }).click();
await page.waitForTimeout(700);
await save("gameplay-combo.png");

await page.keyboard.press("Space");
await page.waitForTimeout(180);
await save("juice-drop.png");

await page.keyboard.press("Space");
await page.waitForTimeout(100);
await save("score.png");

for (const keys of [["ArrowLeft", "Space"], ["ArrowRight", "Space"], ["ArrowRight", "Space"], ["ArrowLeft", "Space"]]) {
  for (const key of keys) await page.keyboard.press(key);
}
await page.waitForTimeout(500);
await save("gameplay-01.png");

const debug = await page.evaluate(() => window.__juiceDebug?.());
console.log(JSON.stringify({ baseUrl, outputDir, score: debug?.hud?.score, lastError: debug?.debug?.lastError }, null, 2));

await browser.close();
