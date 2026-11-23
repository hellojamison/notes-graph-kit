import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { verificationFor, noteKeyForRel } = graphLib;

// --- verificationFor --------------------------------------------------------

test('verificationFor returns "verified" for evidence_format 2 with verification verified', () => {
  assert.equal(verificationFor({ evidence_format: 2, verification: 'verified' }), 'verified');
});

test('verificationFor returns "unverified" for evidence_format 2 with verification unverified', () => {
  assert.equal(verificationFor({ evidence_format: 2, verification: 'unverified' }), 'unverified');
});

test('verificationFor returns "verified" for evidence_format "2" with verification verified', () => {
  assert.equal(verificationFor({ evidence_format: '2', verification: 'verified' }), 'verified');
});

test('verificationFor returns null for evidence_format 2 with unknown verification', () => {
  assert.equal(verificationFor({ evidence_format: 2, verification: 'partial' }), null);
});

test('verificationFor returns null for evidence_format 2 with missing verification', () => {
  assert.equal(verificationFor({ evidence_format: 2 }), null);
});

test('verificationFor returns "verified" for legacy format with status verified', () => {
  assert.equal(verificationFor({ type: 'evidence', status: 'verified' }), 'verified');
});

test('verificationFor returns "unverified" for legacy format with status open', () => {
  assert.equal(verificationFor({ type: 'evidence', status: 'open' }), 'unverified');
});

test('verificationFor returns "unverified" for legacy format with no status', () => {
  assert.equal(verificationFor({ type: 'evidence' }), 'unverified');
});

test('verificationFor returns "unverified" for null frontmatter', () => {
  assert.equal(verificationFor(null), 'unverified');
});

test('verificationFor returns "unverified" for undefined frontmatter', () => {
  assert.equal(verificationFor(undefined), 'unverified');
});

test('verificationFor returns "unverified" for a plain string frontmatter', () => {
  assert.equal(verificationFor('hello'), 'unverified');
});

// --- noteKeyForRel ----------------------------------------------------------

test('noteKeyForRel strips .md extension', () => {
  assert.equal(noteKeyForRel('Notes/foo.md'), 'Notes/foo');
});

test('noteKeyForRel strips .base extension', () => {
  assert.equal(noteKeyForRel('Notes/foo.base'), 'Notes/foo');
});

test('noteKeyForRel strips .MD extension case-insensitively', () => {
  assert.equal(noteKeyForRel('Notes/foo.MD'), 'Notes/foo');
});

test('noteKeyForRel strips .Base extension case-insensitively', () => {
  assert.equal(noteKeyForRel('Notes/foo.Base'), 'Notes/foo');
});

test('noteKeyForRel leaves a path without extension unchanged', () => {
  assert.equal(noteKeyForRel('Notes/foo'), 'Notes/foo');
});

test('noteKeyForRel returns empty string for empty input', () => {
  assert.equal(noteKeyForRel(''), '');
});

test('noteKeyForRel does not strip .md from the middle of a path segment', () => {
  assert.equal(noteKeyForRel('Notes/md-file.txt'), 'Notes/md-file.txt');
});
