// @ts-check
// A short soak inside npm test: 5 seeds over 10 years. The long one is npm run soak.
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { runSoak } from './soak.mjs';

it('runs 5 seeds over 10 years with no errors', () => {
  const report = runSoak({ seeds: 5, fromYear: 1219, toYear: 1229 });
  assert.deepEqual(report.errors, []);
  assert.ok(report.maxSaveBytes > 0 && report.maxSaveBytes < 2 * 1024 * 1024, `save is ${report.maxSaveBytes} bytes`);
});
