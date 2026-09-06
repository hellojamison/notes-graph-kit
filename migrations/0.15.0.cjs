const { planInstructionFile } = require('./instruction-files.cjs');

const MIGRATION = 'vault-0.15.0-claude-instructions';

function apply(planner) {
  if (planner.instructionFile !== 'AGENTS.md') {
    planInstructionFile(planner, planner.instructionFile, MIGRATION, planner.agent);
  }
}

module.exports = {
  id: MIGRATION,
  version: '0.15.0',
  apply
};
