const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
// Fail closed if this small, deliberately restricted policy cannot be read.
function enabled(workflow, branch) {
  const source = fs.readFileSync(path.join(root, workflow), 'utf8');
  const job = source.match(/^  (?:review|verify):\n([\s\S]*?)(?=^  [a-zA-Z_-]+:|$(?![\s\S]))/m)?.[1];
  assert.ok(job, 'expected job');
  const condition = job.match(/^    if: \$\{\{ (.+) \}\}$/m)?.[1];
  if (!condition) return true;
  return condition.split(' && ').every(clause => {
    const match = clause.match(/^github\.head_ref != '([^']+)'$/);
    assert.ok(match, 'unrecognized job policy');
    return branch !== match[1];
  });
}
test('the spelling core PR cannot start the paid API reviewer', () => {
  assert.equal(enabled('.github/workflows/claude-review.yml', 'codex/spelling-chart-core'), false);
  assert.equal(enabled('.github/workflows/claude-review.yml', 'some-other-branch'), true);
});
test('the spelling core PR cannot start legacy CI against checked-out child records', () => {
  assert.equal(enabled('.github/workflows/ci.yml', 'codex/spelling-chart-core'), false);
  assert.equal(enabled('.github/workflows/ci.yml', 'some-other-branch'), true);
});
test('core CI runs the build and core acceptance with no family context or network', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(source, /spelling-core-acceptance:/);
  assert.match(source, /!\/src\/context\/\*/);
  assert.match(source, /unshare --net/);
  assert.match(source, /npm run build/);
  assert.match(source, /chartSpellingLoad\.test\.ts/);
  assert.match(source, /chartSpellingReview\.test\.ts/);
  assert.match(source, /chartKioskAcceptance\.test\.ts/);
  assert.match(source, /ip link set lo up/);
  assert.match(source, /20\.20\.0/);
});
test('kiosk CI exercises real routes and both browser sizes', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  for (const name of ['chartSpellingJourney','chartSpellingAudio','originalSpellingEntrypoint','spellingBrowserAcceptance','originalSpellingParent']) assert.ok(source.includes(name+'.test.ts'));
  assert.match(source, /playwright install/);
});

test('plumbing PR uses only the existing reviewer and isolated verification', () => {
 for (const workflow of ['.github/workflows/claude-review.yml','.github/workflows/ci.yml']) assert.equal(enabled(workflow,'codex/spelling-plumbing'),false);
});
