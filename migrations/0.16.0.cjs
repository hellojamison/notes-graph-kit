// 0.16.0 changes managed helper semantics only. Vault content is intentionally
// untouched; infrastructure planning records the new helper/config state.
const MIGRATION = 'vault-0.16.0-compatibility-safety';
function apply() {}
module.exports = { id: MIGRATION, version: '0.16.0', apply };
