// Generate PNG icons from public/icon.svg for PWA manifest + iOS apple-touch-icon.
// Run from project root: node gen-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVG_PATH = resolve('public/icon.svg');
const OUT_DIR = resolve('public');

const svgContent = readFileSync(SVG_PATH, 'utf-8');

// 192, 512 -> PWA manifest icons (Android/general)
// 180 -> apple-touch-icon (iOS standard size; iOS applies its own corner mask)
const sizes = [
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
  { size: 180, file: 'apple-touch-icon.png' },
];

async function main() {
  const browser = await chromium.launch({ headless: true });

  for (const { size, file } of sizes) {
    const ctx = await browser.newContext({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const html = `<!doctype html><html><head><style>
      html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;}
      svg{display:block;width:${size}px;height:${size}px;}
    </style></head><body>${svgContent}</body></html>`;
    await page.setContent(html);
    await page.waitForTimeout(50);
    const buf = await page.screenshot({ path: resolve(OUT_DIR, file) });
    console.log(`✓ ${file} (${size}x${size}) — ${buf.length} bytes`);
    await ctx.close();
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
