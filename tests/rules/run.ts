// Entry point for `npm run test:rules`.
//
// Node's `--test` CLI doesn't glob `.ts` files out of a directory on its own, and
// relying on shell glob expansion (`tests/rules/*.test.ts`) breaks under
// `firebase emulators:exec`, which runs the wrapped command through cmd.exe on
// Windows — it doesn't expand globs the way a POSIX shell does. Listing the
// directory in Node sidesteps both problems.

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
