// npm run content:validate — schemas, IDs, en/rw key parity and band-label coverage (FR-16, NFR-09).
// Pass --release to also fail on any remaining TODO(content) placeholder (run before a pilot release).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, parseRuleset, ReferralListSchema, TextContentSchema, TODO_MARKER } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const errors: string[] = [];
let todos = 0;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const keysOf = (body: unknown): string[] => {
  const entries = (body as { entries: unknown }).entries;
  return Array.isArray(entries) ? entries.map((e: { id: string }) => e.id) : Object.keys(entries as object);
};

// 1. Rulesets
const rulesets = readdirSync(join(root, 'rulesets')).filter((f) => f.endsWith('.json'));
const parsedRulesets = rulesets.flatMap((file) => {
  try {
    return [parseRuleset(readJson(join(root, 'rulesets', file)))];
  } catch (error) {
    errors.push(`rulesets/${file}: ${(error as Error).message}`);
    return [];
  }
});

// 2. Every language file parses and has the same files and keys as English.
const files = new Map(
  LANGUAGES.map((lang) => [lang, readdirSync(join(root, lang)).filter((f) => f.endsWith('.json'))]),
);
const english = files.get('en') ?? [];
const bodies = new Map<string, unknown>();
for (const lang of LANGUAGES) {
  const list = files.get(lang) ?? [];
  for (const missing of english.filter((f) => !list.includes(f)))
    errors.push(`${lang}/${missing}: missing (en has it)`);
  for (const extra of list.filter((f) => !english.includes(f)))
    errors.push(`${lang}/${extra}: no English version`);
  for (const file of list) {
    const body = readJson(join(root, lang, file));
    const schema = file === 'referral-list.json' ? ReferralListSchema : TextContentSchema;
    const result = schema.safeParse(body);
    if (!result.success) {
      errors.push(
        `${lang}/${file}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
      continue;
    }
    if (result.data.language !== lang)
      errors.push(`${lang}/${file}: language field is "${result.data.language}"`);
    todos += JSON.stringify(body).split(TODO_MARKER).length - 1;
    bodies.set(`${lang}/${file}`, body);
  }
}
for (const file of english) {
  const en = bodies.get(`en/${file}`);
  if (!en) continue;
  const enKeys = new Set(keysOf(en));
  for (const lang of LANGUAGES.filter((l) => l !== 'en')) {
    const other = bodies.get(`${lang}/${file}`);
    if (!other) continue;
    const otherKeys = new Set(keysOf(other));
    for (const k of enKeys) if (!otherKeys.has(k)) errors.push(`${lang}/${file}: missing key ${k}`);
    for (const k of otherKeys) if (!enKeys.has(k)) errors.push(`${lang}/${file}: extra key ${k}`);
  }
}

// 3. Every band a ruleset can produce has a label in every language.
for (const ruleset of parsedRulesets) {
  for (const lang of LANGUAGES) {
    const labels = new Set(keysOf(bodies.get(`${lang}/bands.json`) ?? { entries: {} }));
    if (!labels.has('band.insufficient')) errors.push(`${lang}/bands.json: missing band.insufficient`);
    for (const [domain, bands] of Object.entries(ruleset.severity)) {
      for (const band of Object.keys(bands)) {
        if (!labels.has(`band.${domain}.${band}`)) {
          errors.push(`${lang}/bands.json: no label for band.${domain}.${band} (ruleset ${ruleset.version})`);
        }
      }
    }
  }
}

if (release && todos > 0)
  errors.push(`${todos} ${TODO_MARKER} placeholder(s) remain; a pilot release needs approved wording`);

if (errors.length > 0) {
  console.error(`Content validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `Content valid: ${rulesets.length} ruleset(s), ${english.length} file(s) in ${LANGUAGES.length} languages.` +
    (todos > 0 ? ` ${todos} ${TODO_MARKER} placeholder(s) still need reviewers (fails with --release).` : ''),
);
