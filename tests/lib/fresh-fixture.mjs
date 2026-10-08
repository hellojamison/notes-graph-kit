import fs from 'node:fs';
import path from 'node:path';

// Synthetic installed fixtures are fresh at test start. Production seed notes
// retain their real verification dates; tests for staleness supply older dates.
export function freshFixture(repoRoot, vaultDir = 'Project Notes') {
  const today = new Date().toISOString().slice(0, 10);
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const text = fs.readFileSync(file, 'utf8');
        if (/^source_of_truth: true$/m.test(text)) {
          fs.writeFileSync(file, text.replace(/^last_verified: .*$/m, `last_verified: "${today}"`));
        }
      }
    }
  }
  visit(path.join(repoRoot, vaultDir));
}
