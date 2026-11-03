import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { contractState } = require('../scripts/lib/project-notes-adoption.cjs');

test('contractState returns missing when the file does not exist', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-adoption-'));
  try {
    assert.equal(contractState(repo, 'notes-search-eval.yml'), 'missing');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('contractState returns configured when the file is a regular file', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-adoption-'));
  try {
    const file = path.join(repo, 'notes-context-eval.yml');
    fs.writeFileSync(file, 'schema_version: 1\nqueries: []\n');
    assert.equal(contractState(repo, 'notes-context-eval.yml'), 'configured');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('contractState returns unsafe when the name resolves to a symlink', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-adoption-'));
  try {
    const target = path.join(repo, 'real-eval.yml');
    fs.writeFileSync(target, 'schema_version: 1\n');
    const link = path.join(repo, 'notes-search-eval.yml');
    fs.symlinkSync(target, link);
    assert.equal(contractState(repo, 'notes-search-eval.yml'), 'unsafe');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('contractState returns unsafe when the name resolves to a directory', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-adoption-'));
  try {
    fs.mkdirSync(path.join(repo, 'notes-search-eval.yml'), { recursive: true });
    assert.equal(contractState(repo, 'notes-search-eval.yml'), 'unsafe');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('contractState handles a relative path inside the repo root', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-adoption-'));
  try {
    const file = path.join(repo, 'sub', 'notes-search-eval.yml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'schema_version: 1\n');
    assert.equal(contractState(repo, 'sub/notes-search-eval.yml'), 'configured');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
