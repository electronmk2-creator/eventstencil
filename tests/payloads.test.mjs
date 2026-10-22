import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parsePayload, analyzePayloads, inferContract } from '../runtime.mjs';

const manifest = JSON.parse(await readFile(new URL('../cases.json', import.meta.url), 'utf8'));

for (const entry of manifest.cases) {
  test(entry.name, async (t) => {
    const baseline = parsePayload(await readFile(new URL('../' + entry.baselinePath, import.meta.url), 'utf8'));
    const candidate = parsePayload(await readFile(new URL('../' + entry.candidatePath, import.meta.url), 'utf8'));
    const expectedContract = JSON.parse(await readFile(new URL('../' + entry.contractPath, import.meta.url), 'utf8'));

    // Keep the expected baseline separate. Edit candidate fixtures to check later events.
    assert.deepEqual(JSON.parse(JSON.stringify(inferContract(baseline, entry.options))), expectedContract,
      'Baseline shape no longer matches the approved observed-shape snapshot. Review intentional baseline changes.');
    const result = analyzePayloads(baseline, candidate, entry.options);
    const errors = result.issues.filter((issue) => issue.severity === 'error');
    for (const issue of result.issues.filter((item) => item.severity === 'warning')) {
      t.diagnostic('Warning ' + issue.path + ': ' + issue.message);
    }
    assert.equal(errors.length, 0,
      errors.map((issue) => issue.path + ' [' + issue.kind + '] ' + issue.message).join('\n'));
  });
}
