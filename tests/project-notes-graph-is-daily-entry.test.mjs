import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { isDailyEntry, isGeneratedDailyView, isDaily } = graphLib;

// isDailyEntry

test('isDailyEntry returns true for valid Daily/YYYY-MM-DD/slug.md paths', () => {
  assert.equal(isDailyEntry('Daily/2026-10-31/slug.md'), true);
  assert.equal(isDailyEntry('Daily/2026-01-01/my-entry.md'), true);
  assert.equal(isDailyEntry('Daily/1999-12-31/a.md'), true);
  assert.equal(isDailyEntry('Daily/2026-12-31/hello-world.md'), true);
});

test('isDailyEntry returns false for legacy daily paths', () => {
  assert.equal(isDailyEntry('2026-10-31.md'), false);
  assert.equal(isDailyEntry('1999-01-01.md'), false);
});

test('isDailyEntry returns false for paths not under Daily/', () => {
  assert.equal(isDailyEntry('2026-10-31.md'), false);
  assert.equal(isDailyEntry('daily/2026-10-31/slug.md'), false);
  assert.equal(isDailyEntry('DAILY/2026-10-31/slug.md'), false);
  assert.equal(isDailyEntry('Apps/My Project.md'), false);
});

test('isDailyEntry returns false for nested paths under Daily/', () => {
  assert.equal(isDailyEntry('Daily/2026-10-31/sub/dir.md'), false);
  assert.equal(isDailyEntry('Daily/2026-10-31/a/b.md'), false);
});

test('isDailyEntry returns false for wrong extensions', () => {
  assert.equal(isDailyEntry('Daily/2026-10-31/slug.txt'), false);
  assert.equal(isDailyEntry('Daily/2026-10-31/slug.md.bak'), false);
});

test('isDailyEntry returns false for malformed date parts', () => {
  assert.equal(isDailyEntry('Daily/26-10-31/slug.md'), false);
  assert.equal(isDailyEntry('Daily/2026-1-31/slug.md'), false);
  assert.equal(isDailyEntry('Daily/2026-10-3/slug.md'), false);
});

test('isDailyEntry returns false for empty or non-string input', () => {
  assert.equal(isDailyEntry(''), false);
});

// isGeneratedDailyView

test('isGeneratedDailyView returns true for valid Daily/YYYY-MM-DD.view.md paths', () => {
  assert.equal(isGeneratedDailyView('Daily/2026-10-31.view.md'), true);
  assert.equal(isGeneratedDailyView('Daily/2026-01-01.view.md'), true);
  assert.equal(isGeneratedDailyView('Daily/1999-12-31.view.md'), true);
});

test('isGeneratedDailyView returns false for non-view files in Daily/', () => {
  assert.equal(isGeneratedDailyView('Daily/2026-10-31/slug.md'), false);
  assert.equal(isGeneratedDailyView('Daily/2026-10-31.txt'), false);
});

test('isGeneratedDailyView returns false for legacy daily paths', () => {
  assert.equal(isGeneratedDailyView('2026-10-31.md'), false);
  assert.equal(isGeneratedDailyView('2026-10-31.view.md'), false);
});

test('isGeneratedDailyView returns false for paths not under Daily/', () => {
  assert.equal(isGeneratedDailyView('daily/2026-10-31.view.md'), false);
  assert.equal(isGeneratedDailyView('DAILY/2026-10-31.view.md'), false);
  assert.equal(isGeneratedDailyView('Apps/2026-10-31.view.md'), false);
});

test('isGeneratedDailyView returns false for extra suffixes', () => {
  assert.equal(isGeneratedDailyView('Daily/2026-10-31.view.md.bak'), false);
  assert.equal(isGeneratedDailyView('Daily/2026-10-31.view2.md'), false);
});

test('isGeneratedDailyView returns false for malformed date parts', () => {
  assert.equal(isGeneratedDailyView('Daily/26-10-31.view.md'), false);
  assert.equal(isGeneratedDailyView('Daily/2026-1-31.view.md'), false);
});

test('isGeneratedDailyView returns false for empty input', () => {
  assert.equal(isGeneratedDailyView(''), false);
});

// isDaily (legacy or daily entry)

test('isDaily returns true for legacy daily paths', () => {
  assert.equal(isDaily('2026-10-31.md'), true);
  assert.equal(isDaily('1999-01-01.md'), true);
  assert.equal(isDaily('2026-12-31.md'), true);
});

test('isDaily returns true for daily entry paths', () => {
  assert.equal(isDaily('Daily/2026-10-31/slug.md'), true);
  assert.equal(isDaily('Daily/2026-01-01/my-entry.md'), true);
});

test('isDaily returns false for non-daily paths', () => {
  assert.equal(isDaily('Apps/My Project.md'), false);
  assert.equal(isDaily('Processes/My Process.md'), false);
  assert.equal(isDaily('Templates/Task Note Template.md'), false);
});

test('isDaily returns false for generated daily views', () => {
  assert.equal(isDaily('Daily/2026-10-31.view.md'), false);
});

test('isDaily returns false for malformed daily paths', () => {
  assert.equal(isDaily('26-10-31.md'), false);
  assert.equal(isDaily('Daily/26-10-31/slug.md'), false);
  assert.equal(isDaily('daily/2026-10-31/slug.md'), false);
});

test('isDaily returns false for empty input', () => {
  assert.equal(isDaily(''), false);
});
