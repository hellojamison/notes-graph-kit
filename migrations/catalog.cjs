const MIGRATIONS = Object.freeze([
  Object.freeze({
    id: 'vault-0.2.16-schema-indexes',
    version: '0.2.16',
    module: './0.2.16.cjs'
  }),
  Object.freeze({
    id: 'vault-0.3.0-typed-templates',
    version: '0.3.0',
    module: './0.3.0.cjs'
  }),
  Object.freeze({
    id: 'vault-0.4.0-managed-sections',
    version: '0.4.0',
    module: './0.4.0.cjs'
  }),
  Object.freeze({
    id: 'vault-0.13.0-status-notes',
    version: '0.13.0',
    module: './0.13.0.cjs'
  }),
  Object.freeze({
    id: 'vault-0.14.0-current-evidence',
    version: '0.14.0',
    module: './0.14.0.cjs'
  })
]);

const MIGRATION_IDS = Object.freeze(MIGRATIONS.map(({ id }) => id));

module.exports = {
  MIGRATIONS,
  MIGRATION_IDS
};
