import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromTest = createRequire(import.meta.url);
const { EvaluationInputError, expectedMatches, renderText } = requireFromTest('../scripts/evaluate-project-notes-search.cjs');

test('EvaluationInputError is an instance of Error', () => {
  const err = new EvaluationInputError('bad input');
  assert.ok(err instanceof Error);
  assert.ok(err instanceof EvaluationInputError);
  assert.equal(err.message, 'bad input');
});

test('expectedMatches returns true when paths match and expected has no heading', () => {
  const result = { path: 'Notes/Task.md', heading: 'Title' };
  const expected = { path: 'Notes/Task.md' };
  assert.equal(expectedMatches(result, expected), true);
});

test('expectedMatches returns true when paths and headings match', () => {
  const result = { path: 'Notes/Task.md', heading: 'Title' };
  const expected = { path: 'Notes/Task.md', heading: 'Title' };
  assert.equal(expectedMatches(result, expected), true);
});

test('expectedMatches returns false when paths differ', () => {
  const result = { path: 'Notes/Task.md', heading: 'Title' };
  const expected = { path: 'Notes/Other.md' };
  assert.equal(expectedMatches(result, expected), false);
});

test('expectedMatches returns false when headings differ', () => {
  const result = { path: 'Notes/Task.md', heading: 'Title' };
  const expected = { path: 'Notes/Task.md', heading: 'Different' };
  assert.equal(expectedMatches(result, expected), false);
});

test('renderText produces a one-line summary for zero queries', () => {
  const report = {
    topK: 3,
    summary: { queryCount: 0, passed: 0, failed: 0, top1Hits: 0, top3Hits: 0, meanReciprocalRank: 0 },
    queries: []
  };
  const output = renderText(report);
  assert.ok(output.startsWith('Search evaluation: 0/0 queries passed at top 3\n'));
  assert.ok(output.includes('MRR: 0.000'));
});

test('renderText includes PASS for a passing query', () => {
  const report = {
    topK: 3,
    summary: { queryCount: 1, passed: 1, failed: 0, top1Hits: 1, top3Hits: 1, meanReciprocalRank: 1 },
    queries: [{
      id: 'q1',
      query: 'hello world',
      passed: true,
      firstRelevantRank: 1,
      reciprocalRank: 1,
      expected: [{ path: 'Notes/Task.md', rank: 1 }],
      topResults: [{ path: 'Notes/Task.md', heading: 'Title', score: 0.5 }]
    }]
  };
  const output = renderText(report);
  assert.ok(output.includes('PASS q1'));
  assert.ok(output.includes("rank 1"));
});

test('renderText includes FAIL and actual results for a failing query', () => {
  const report = {
    topK: 3,
    summary: { queryCount: 1, passed: 0, failed: 1, top1Hits: 0, top3Hits: 0, meanReciprocalRank: 0 },
    queries: [{
      id: 'q1',
      query: 'missing thing',
      passed: false,
      firstRelevantRank: null,
      reciprocalRank: 0,
      expected: [{ path: 'Notes/Missing.md', rank: null }],
      topResults: [{ path: 'Notes/Other.md', heading: 'Title', score: 0.1 }]
    }]
  };
  const output = renderText(report);
  assert.ok(output.includes('FAIL q1'));
  assert.ok(output.includes('not found'));
  assert.ok(output.includes('actual 1: Notes/Other.md#Title'));
});
