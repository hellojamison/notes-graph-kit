import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromTest = createRequire(import.meta.url);
const graphLib = requireFromTest(path.join(kitRoot, 'scripts/lib/project-notes-graph.cjs'));

const { validateRouteConfig, isTemplate, isLegacyDaily } = graphLib;

test('validateRouteConfig rejects non-array routes', () => {
  assert.deepEqual(
    validateRouteConfig({ routes: 'not-an-array' }),
    ['notes-graph.config.json: routes must be an array']
  );
});

test('validateRouteConfig accepts empty config and returns no errors for defaults', () => {
  assert.deepEqual(validateRouteConfig({}), []);
});

test('validateRouteConfig accepts empty routes array and returns no errors for defaults', () => {
  assert.deepEqual(validateRouteConfig({ routes: [] }), []);
});

test('validateRouteConfig accepts valid custom routes without a graph', () => {
  const config = {
    routes: [
      {
        id: 'my-route',
        processRel: 'Processes/My Process.md',
        aliases: ['my']
      }
    ]
  };
  assert.deepEqual(validateRouteConfig(config), []);
});

test('validateRouteConfig flags missing id in custom routes', () => {
  const config = {
    routes: [
      {
        processRel: 'Processes/My Process.md'
      }
    ]
  };
  const errors = validateRouteConfig(config);
  assert.ok(errors.some((e) => e.includes('id must be a non-empty string')));
});

test('validateRouteConfig flags missing processRel in custom routes', () => {
  const config = {
    routes: [
      {
        id: 'my-route'
      }
    ]
  };
  const errors = validateRouteConfig(config);
  assert.ok(errors.some((e) => e.includes('processRel must be a non-empty string')));
});

test('validateRouteConfig flags invalid aliases type', () => {
  const config = {
    routes: [
      {
        id: 'my-route',
        processRel: 'Processes/My Process.md',
        aliases: 'not-an-array'
      }
    ]
  };
  const errors = validateRouteConfig(config);
  assert.ok(errors.some((e) => e.includes('aliases must be an array')));
});

test('validateRouteConfig flags duplicate aliases across routes', () => {
  const config = {
    routes: [
      {
        id: 'route-a',
        processRel: 'Processes/A.md',
        aliases: ['shared']
      },
      {
        id: 'route-b',
        processRel: 'Processes/B.md',
        aliases: ['shared']
      }
    ]
  };
  const errors = validateRouteConfig(config);
  assert.deepEqual(
    errors,
    ['route aliases normalize to duplicate "shared": route "route-a", route "route-b"']
  );
});

test('validateRouteConfig with graph flags missing process target when routes configured', () => {
  const config = {
    routes: [
      {
        id: 'my-route',
        processRel: 'Processes/Nonexistent.md'
      }
    ]
  };
  const errors = validateRouteConfig(config, { index: { byPath: new Map(), byBasename: new Map() } });
  assert.ok(errors.some((e) => e.includes('must target an existing process note')));
});

test('isTemplate returns true for paths under Templates/', () => {
  assert.equal(isTemplate('Templates/Task Note Template.md'), true);
  assert.equal(isTemplate('Templates/Foo.md'), true);
  assert.equal(isTemplate('Templates/Sub/dir.md'), true);
});

test('isTemplate returns false for paths not under Templates/', () => {
  assert.equal(isTemplate('Processes/My Process.md'), false);
  assert.equal(isTemplate('Apps/My Project.md'), false);
  assert.equal(isTemplate('Task Note Template.md'), false);
  assert.equal(isTemplate(''), false);
});

test('isLegacyDaily returns true for YYYY-MM-DD.md at root', () => {
  assert.equal(isLegacyDaily('2026-10-31.md'), true);
  assert.equal(isLegacyDaily('1999-01-01.md'), true);
  assert.equal(isLegacyDaily('2026-12-31.md'), true);
});

test('isLegacyDaily returns false for non-matching patterns', () => {
  assert.equal(isLegacyDaily('2026-10-31.md.bak'), false);
  assert.equal(isLegacyDaily('Daily/2026-10-31/entry.md'), false);
  assert.equal(isLegacyDaily('2026-10-31.txt'), false);
  assert.equal(isLegacyDaily('26-10-31.md'), false);
  assert.equal(isLegacyDaily('Processes/2026-10-31.md'), false);
  assert.equal(isLegacyDaily(''), false);
});
