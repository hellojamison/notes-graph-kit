---
title: Release Note Template
schema_version: 1
type: template
status: active
date: 2026-06-03
tags:
  - template
  - notes/template
---

# My Project Version

```yaml
---
title: My Project Version
schema_version: 1
type: release
status: verified
date: YYYY-MM-DD
area:
  - release
  - packaging
tags:
  - notes/release
last_verified: YYYY-MM-DD
freshness: reverify-before-use
---
```

## Build

- App version:
- Build version:
- Artifact:
- SHA-256:
- Notarization:
- Gatekeeper:
- Sparkle build version:
- Sparkle download size:
- Sparkle EdDSA signature:

## Package / Updater Metadata

Future package closeouts should include one copyable metadata block with the customer changelog directly under the package/updater fields. Paste the entire block into the admin metadata field. Changelog content should be HTML, not plain Markdown bullets.

```text
version:
build:
installer:
size:
sparkle_ed_signature:
sha256:
changelog: |
  <ul>
    <li>Customer-facing change.</li>
  </ul>
```

## Changes

## Verification

## Upload / Availability

## Not Verified
