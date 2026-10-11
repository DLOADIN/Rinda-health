import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const SENTINELS = ['187', '113', '482915', 'DEMO-SENTNNEL'];
const CONTEXT = [/servings\D{0,20}13\b/i, /"13"/];
const dir = 'test-results/logs';

if (!existsSync(dir)) {
  console.log(`No logs in ${dir} yet; run npm run test:e2e first.`);
  process.exit(process.env.CI ? 1 : 0); // in CI, missing logs mean the capture broke
}
const files = readdirSync(dir, { recursive: true })
  .map((f) => path.join(dir, String(f)))
  .filter((f) => statSync(f).isFile());

if (files.length === 0) {
  console.error(`FR-15 sentinel test: no log files in ${dir}; the e2e log capture did not run.`);
  process.exit(1);
}

const hits = [];
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      // Ignore ISO timestamps and durations so the numeric sentinels only match values.
      const scrubbed = line
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '') // UUIDs
        // Random request IDs are 24 hex characters; any digits inside them are not values (e.g. "...14187d4...").
        .replace(/"reqId":"[0-9a-f]+"/gi, '')
        .replace(/"(time|durationMs|pid|port)":\d+/g, '');
      for (const s of SENTINELS)
        if (scrubbed.includes(s)) hits.push(`${file}:${i + 1} contains sentinel ${s}`);
      for (const re of CONTEXT) if (re.test(scrubbed)) hits.push(`${file}:${i + 1} matches ${re}`);
    });
}
if (hits.length) {
  console.error(`FR-15 sentinel test failed:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`FR-15 sentinel test passed: ${files.length} log file(s), no sensitive values.`);
