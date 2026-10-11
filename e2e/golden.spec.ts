import path from 'node:path';
import vm from 'node:vm';
import { expect, test } from '@playwright/test';
import golden from '../packages/rules/test/golden/v1.0.json' with { type: 'json' };
import planner from '../packages/rules/test/golden/planner-v1.0.json' with { type: 'json' };

const cases = [...golden.cases, ...planner.cases].map((c) => ({ id: c.id, input: c.input }));
let bundle = '';
let nodeOutputs: string[] = [];

test.beforeAll(async () => {
  const { build } = await import('vite');
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    root: path.resolve(import.meta.dirname, '..'),
    build: {
      write: false,
      minify: true,
      lib: {
        entry: path.resolve(import.meta.dirname, 'golden/entry.ts'),
        formats: ['iife'],
        name: 'RindaGolden',
      },
    },
  });
  const result = Array.isArray(output) ? output[0] : output;
  const chunk = (result as { output: Array<{ type: string; code?: string }> }).output.find(
    (o) => o.type === 'chunk',
  );
  bundle = chunk?.code ?? '';
  expect(bundle.length).toBeGreaterThan(0);

  const sandbox: { RindaGolden?: { run: (input: unknown) => string } } = {};
  vm.runInNewContext(`${bundle};this.RindaGolden=RindaGolden;`, sandbox);
  nodeOutputs = cases.map((c) => sandbox.RindaGolden?.run(c.input) ?? '');
});

test(`all ${cases.length} golden cases match Node in this browser`, async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ content: bundle });
  const browserOutputs = await page.evaluate(
    (inputs) =>
      inputs.map((i) =>
        (window as unknown as { RindaGolden: { run: (x: unknown) => string } }).RindaGolden.run(i),
      ),
    cases.map((c) => c.input),
  );
  const mismatches = cases.filter((_, i) => browserOutputs[i] !== nodeOutputs[i]).map((c) => c.id);
  expect(mismatches).toEqual([]);
});
