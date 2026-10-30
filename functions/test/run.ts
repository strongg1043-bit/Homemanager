// Entry point for `npm run test:functions` (from the repo root).
// Same pattern as tests/rules/run.ts: list the directory in Node rather than
// relying on shell globs, which `firebase emulators:exec` doesn't expand on Windows.

import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir)
  .filter(f => f.endsWith('.test.ts'))
  .map(f => join(dir, f));

if (files.length === 0) {
  console.error(`No *.test.ts files found in ${dir}`);
  process.exit(1);
}

const stream = run({ files, concurrency: false });
stream.compose(tap).pipe(process.stdout);
stream.on('test:fail', () => { process.exitCode = 1; });
