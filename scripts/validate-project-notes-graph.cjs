#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  allowedTypes,
  allowedStatuses,
  allowedConfidence,
  relationshipTypeExpectations,
  routeDefinitions,
  getVaultRoot,
  loadVaultGraph,
  extractWikilinkTargets,
  resolveTarget,
  noteKeyForRel,
  asArray,
  isTemplate,
  isDaily,
  isStructured
} = require('./lib/project-notes-graph.cjs');

const vaultRoot = getVaultRoot();
const errors = [];
const warnings = [];

function hasInbound(inboundByRel, rel) {
  return (inboundByRel.get(rel) || new Set()).size > 0;
}

function daysSince(value, now = new Date()) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

if (!fs.existsSync(vaultRoot)) {
  errors.push(`Missing vault root: ${vaultRoot}`);
} else {
  const graph = loadVaultGraph({ vaultRoot });
  const { notes, baseFiles, index, frontmatterByRel } = graph;
  const inboundByRel = new Map();

  for (const note of notes) {
    const inboundTargets = extractWikilinkTargets(note.text);
    if (note.frontmatter) {
      for (const field of Object.keys(relationshipTypeExpectations)) {
        for (const value of asArray(note.frontmatter[field])) {
          if (typeof value === 'string') {
            inboundTargets.push(...extractWikilinkTargets(value));
          }
        }
      }
    }
    for (const target of inboundTargets) {
      const resolved = resolveTarget(target, index);
      if (resolved && resolved !== note.rel) {
        if (!inboundByRel.has(resolved)) {
          inboundByRel.set(resolved, new Set());
        }
        inboundByRel.get(resolved).add(note.rel);
      }
    }
  }

  const appNoteNames = new Set(
    notes
      .filter((note) => note.rel.startsWith('Apps/') && note.frontmatter?.type === 'app')
      .flatMap((note) => [
        path.basename(note.rel, '.md'),
        note.frontmatter.title
      ].filter(Boolean))
  );

  for (const definition of routeDefinitions) {
    if (!resolveTarget(definition.processRel, index)) {
      warnings.push(`route alias "${definition.id}" points to missing ${definition.processRel}`);
    }
  }

  for (const note of notes) {
    const { rel, frontmatter, text, frontmatterError } = note;
    const structured = isStructured(rel);
    const template = isTemplate(rel);

    if (frontmatterError) {
      errors.push(`${rel}: ${frontmatterError}`);
    }

    if (!frontmatter) {
      if (structured) {
        warnings.push(`${rel}: legacy structured note is missing frontmatter`);
      } else if (isDaily(rel)) {
        warnings.push(`${rel}: legacy daily note has no frontmatter`);
      } else {
        warnings.push(`${rel}: legacy note has no frontmatter`);
      }
      continue;
    }
    const schemaVersion = frontmatter.schema_version;
    const schemaManaged = schemaVersion === 1 || schemaVersion === '1';

    if (frontmatter.type && !allowedTypes.has(frontmatter.type)) {
      const message = `${rel}: invalid type "${frontmatter.type}"`;
      if (schemaManaged) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    } else if (structured && !template && !frontmatter.type) {
      const message = `${rel}: structured note is missing type`;
      if (schemaManaged) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    } else if (!structured && !template && frontmatter.type && !frontmatter.status) {
      errors.push(`${rel}: promoted note is missing status`);
    }

    if (frontmatter.status && !allowedStatuses.has(frontmatter.status)) {
      const message = `${rel}: invalid status "${frontmatter.status}"`;
      if (schemaManaged) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }

    if (frontmatter.confidence && !allowedConfidence.has(frontmatter.confidence)) {
      errors.push(`${rel}: invalid confidence "${frontmatter.confidence}"`);
    }

    if (!template && frontmatter.source_of_truth === true) {
      if (!frontmatter.last_verified) {
        errors.push(`${rel}: source_of_truth note is missing last_verified`);
      }
      if (!frontmatter.confidence) {
        errors.push(`${rel}: source_of_truth note is missing confidence`);
      }
      const age = daysSince(frontmatter.last_verified);
      if (age != null && age > 90) {
        warnings.push(`${rel}: source_of_truth last_verified is ${age} days old`);
      }
    }

    if (frontmatter.app && !appNoteNames.has(frontmatter.app)) {
      errors.push(`${rel}: app "${frontmatter.app}" has no matching app note`);
    }

    if (!template && frontmatter.type && asArray(frontmatter.related_apps).length === 0) {
      warnings.push(`${rel}: typed note has no related_apps`);
    }

    if (!template && frontmatter.type === 'process' && frontmatter.status !== 'archived') {
      if (asArray(frontmatter.related_runbooks).length === 0) {
        warnings.push(`${rel}: process note has no related_runbooks`);
      }
      if (asArray(frontmatter.related_decisions).length === 0) {
        warnings.push(`${rel}: process note has no related_decisions`);
      }
      if (asArray(frontmatter.related_evidence).length === 0) {
        warnings.push(`${rel}: process note has no related_evidence`);
      }
    }

    if (
      !template
      && frontmatter.created_by === 'project-notes-cli'
      && frontmatter.type === 'evidence'
    ) {
      if (asArray(frontmatter.related_apps).length === 0) {
        warnings.push(`${rel}: CLI-created evidence note has no related_apps`);
      }
      if (asArray(frontmatter.related_processes).length === 0) {
        warnings.push(`${rel}: CLI-created evidence note has no related_processes`);
      }
      if (asArray(frontmatter.related_runbooks).length === 0) {
        warnings.push(`${rel}: CLI-created evidence note has no related_runbooks`);
      }
    }

    if (!template && structured) {
      const linkTargets = extractWikilinkTargets(text);
      for (const target of linkTargets) {
        if (!resolveTarget(target, index)) {
          errors.push(`${rel}: broken wikilink [[${target}]]`);
        }
      }
    }

    const mustHaveInbound = !template
      && frontmatter.status !== 'archived'
      && (
        frontmatter.type === 'process'
        || frontmatter.type === 'runbook'
        || (frontmatter.type === 'decision' && frontmatter.source_of_truth === true)
      );
    if (mustHaveInbound && !hasInbound(inboundByRel, rel)) {
      warnings.push(`${rel}: ${frontmatter.type} note has no inbound links`);
    }

    for (const field of Object.keys(relationshipTypeExpectations)) {
      for (const value of asArray(frontmatter[field])) {
        if (typeof value === 'string') {
          for (const target of extractWikilinkTargets(value)) {
            const resolved = resolveTarget(target, index);
            if (!resolved) {
              errors.push(`${rel}: ${field} has broken wikilink [[${target}]]`);
              continue;
            }
            const targetFrontmatter = frontmatterByRel.get(resolved);
            const expectedTypes = relationshipTypeExpectations[field];
            if (!targetFrontmatter?.type || !expectedTypes.has(targetFrontmatter.type)) {
              const expected = [...expectedTypes].join(' or ');
              const actual = targetFrontmatter?.type || 'missing type';
              errors.push(`${rel}: ${field} target [[${target}]] must be type ${expected}; found ${actual}`);
            }
          }
        }
      }
    }
  }

  for (const baseFile of baseFiles) {
    const rel = path.relative(vaultRoot, baseFile).split(path.sep).join('/');
    try {
      yaml.load(fs.readFileSync(baseFile, 'utf8'));
    } catch (error) {
      errors.push(`${rel}: invalid Base YAML: ${error.message}`);
    }
  }
}

for (const warning of warnings) {
  console.warn(`WARN ${warning}`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR ${error}`);
  }
  process.exit(1);
}

console.log(`Project notes graph validation passed with ${warnings.length} warning(s).`);
