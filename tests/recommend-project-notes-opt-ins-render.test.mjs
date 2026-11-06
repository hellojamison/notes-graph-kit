import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { render } = require('../scripts/recommend-project-notes-opt-ins.cjs');

test('render produces a header line with note_count', () => {
  const report = {
    schema_version: 1,
    note_count: 42,
    recommendations: []
  };
  const output = render(report);
  assert.ok(output.startsWith('Agent opt-in recommendations: 42 Markdown notes\n'));
});

test('render includes each recommendation with id, state, rationale and next_step', () => {
  const report = {
    schema_version: 1,
    note_count: 5,
    recommendations: [
      {
        id: 'search-evaluation-contract',
        state: 'missing',
        recommendation: 'recommended',
        requires_user_approval: true,
        action_kind: 'writes-reviewed-file',
        rationale: 'A retrieved contract is missing.',
        next_step: 'Ask before creating it.',
        command: null
      },
      {
        id: 'duplicate-review',
        state: 'available',
        recommendation: 'optional-read-only',
        requires_user_approval: false,
        action_kind: 'read-only',
        rationale: 'Notes are present.',
        next_step: 'Run the scan without approval.',
        command: 'npm run notes:duplicates'
      }
    ]
  };
  const output = render(report);
  assert.match(output, /RECOMMENDED search-evaluation-contract \[missing\]/);
  assert.ok(output.includes('  A retrieved contract is missing.'));
  assert.ok(output.includes('  Next: Ask before creating it.'));
  assert.ok(output.includes('OPTIONAL-READ-ONLY duplicate-review [available]'));
  assert.ok(output.includes('  Notes are present.'));
  assert.ok(output.includes('  Command: npm run notes:duplicates'));
});

test('render omits the Command line when command is null or missing', () => {
  const report = {
    schema_version: 1,
    note_count: 3,
    recommendations: [
      {
        id: 'test-id',
        state: 'ok',
        recommendation: 'enabled',
        requires_user_approval: false,
        action_kind: 'read-only',
        rationale: 'Done.',
        next_step: 'Keep it.'
      }
    ]
  };
  const output = render(report);
  assert.ok(!output.includes('Command:'));
});

test('render includes the approval line when requires_user_approval is true', () => {
  const report = {
    schema_version: 1,
    note_count: 10,
    recommendations: [
      {
        id: 'approval-test',
        state: 'configured',
        recommendation: 'enabled',
        requires_user_approval: true,
        action_kind: 'writes-config-and-instructions',
        rationale: 'Needs approval.',
        next_step: 'Ask the user.',
        command: null
      }
    ]
  };
  const output = render(report);
  assert.ok(output.includes('  User approval required before this write or CI edit.'));
});

test('render omits the approval line when requires_user_approval is false', () => {
  const report = {
    schema_version: 1,
    note_count: 7,
    recommendations: [
      {
        id: 'no-approval-test',
        state: 'ready',
        recommendation: 'optional',
        requires_user_approval: false,
        action_kind: 'read-only',
        rationale: 'No approval needed.',
        next_step: 'Go ahead.',
        command: null
      }
    ]
  };
  const output = render(report);
  assert.ok(!output.includes('User approval required'));
});

test('render returns a single trailing newline after the last line', () => {
  const report = {
    schema_version: 1,
    note_count: 0,
    recommendations: []
  };
  const output = render(report);
  assert.equal(output, 'Agent opt-in recommendations: 0 Markdown notes\n');
});

test('render uppercases the recommendation field', () => {
  const report = {
    schema_version: 1,
    note_count: 1,
    recommendations: [
      {
        id: 'case-test',
        state: 'foo',
        recommendation: 'read-only',
        requires_user_approval: false,
        action_kind: 'read-only',
        rationale: 'Lowercase recommendation.',
        next_step: 'Check case.',
        command: null
      }
    ]
  };
  const output = render(report);
  assert.ok(output.includes('READ-ONLY case-test [foo]'));
});
