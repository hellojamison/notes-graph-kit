# Frozen migration fixtures

These files are representative shipped skeleton components frozen into the
repository. Migration tests use their checked-in bytes and SHA-256 manifests;
the migration runtime never reads Git history or tags.

- `0.2.15`: frozen from the last 0.2.15 tree.
- `0.2.16`: frozen from the 0.2.16 release tree.
- `0.3.0`: frozen from the 0.3.0 release tree.

Each variant includes a seed entrypoint, a product template, and an Obsidian
Base so semantic migration paths cover Markdown, scaffold, and Base changes.
