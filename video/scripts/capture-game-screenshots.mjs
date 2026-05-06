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

await page.goto(baseUrl, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#gameCanvas");
await save("title.png");

await page.getByRole("button", { name: "Settings" }).click();
await page.getByLabel("AI Speed").selectOption("fast");
await page.getByLabel("Shipping Sec").fill("20");
await page.getByRole("button", { name: "Settings" }).click();
await page.getByRole("button", { name: "Start" }).click();
await page.waitForTimeout(700);
await save("gameplay-start.png");

await page.getByRole("button", { name: "AI Off" }).click();
await page.waitForTimeout(2600);
await save("gameplay-01.png");

await page.waitForTimeout(4200);
await save("gameplay-combo.png");

await page.keyboard.press("Space");
await page.waitForTimeout(900);
await save("score.png");

const debug = await page.evaluate(() => window.__juiceDebug?.());
console.log(JSON.stringify({ baseUrl, outputDir, score: debug?.hud?.score, lastError: debug?.debug?.lastError }, null, 2));

await browser.close();
