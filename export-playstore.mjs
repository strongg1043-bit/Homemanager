// Run from project root: node export-playstore.mjs
// Exports 5 Play Store assets as PNGs using the installed Playwright browser.
//
// Strategy: elementHandle.screenshot() with deviceScaleFactor to hit exact px dimensions.
//   Feature graphic (.fg) → CSS 1024×500 at dpr 1  = 1024×500 output
//   Screenshots (.sc)     → CSS 248×441 at dpr 4.35 ≈ 1080×1920 output

import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const SRC_HTML = 'C:/Users/stron/AppData/Local/Temp/claude/C--ClaudeCode-HomeManager-App/8ff26a4d-5257-46fb-8d88-db9448ec4586/scratchpad/playstore-assets.html';
const FILE_URL = `file:///${SRC_HTML}`;
const OUT      = resolve('playstore-exports');

// .sc card display size → 1080×1920 target
const SC_W  = 248;
const SCALE = 1080 / SC_W;       // 4.354839…
const SC_H  = Math.round(1920 / SCALE); // 441 — integer so 441 × SCALE ≈ 1920

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // ── 1. Feature Graphic  1024 × 500  (dpr 1) ─────────────────────────────
  // clip is in CSS px; at dpr 1 → output = 1024×500 physical px.
  {
    const ctx  = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1100, height: 1100 });
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const box = await page.locator('.fg').boundingBox();
    await page.screenshot({
      path: resolve(OUT, '01-feature-graphic.png'),
      clip: { x: box.x, y: box.y, width: 1024, height: 500 },
    });
    await ctx.close();
    console.log('✓  01-feature-graphic.png   (1024 × 500)');
  }

  // ── 2–5. Phone Screenshots  1080 × 1920  (dpr SCALE) ────────────────────
  // clip {width: SC_W, height: SC_H} in CSS px × dpr SCALE = 1080 × 1920 px.
  const screens = [
    { file: '02-child-dashboard', sel: '.sc-1' },
    { file: '03-parent-review',   sel: '.sc-2' },
    { file: '04-bank-rewards',    sel: '.sc-3' },
    { file: '05-family-setup',    sel: '.sc-4' },
  ];

  for (const { file, sel } of screens) {
    const ctx  = await browser.newContext({ deviceScaleFactor: SCALE });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1200, height: 2000 });
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const box = await page.locator(sel).boundingBox();
    await page.screenshot({
      path: resolve(OUT, `${file}.png`),
      clip: { x: box.x, y: box.y, width: SC_W, height: SC_H },
    });
    await ctx.close();
    console.log(`✓  ${file}.png   (1080 × 1920)`);
  }

  await browser.close();
  console.log(`\n5 Play Store assets saved to:\n  ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
