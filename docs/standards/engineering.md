# Engineering

- Follow nearby TypeScript/React patterns; reuse shared calculations and controls.
  Extract a focused helper when a change would otherwise duplicate business logic.
  Do not introduce a framework, service layer, or dependency for hypothetical scale.
- Keep the iPhone browser usable: clear labels, touch-friendly controls, readable
  forms, no horizontal overflow, and visible loading, empty, failure, and success
  states. Check Safari-sensitive features such as camera and downloads manually.
- Validate request inputs on the server, including numeric bounds, dates, and
  ownership. An ID alone is never sufficient for a personal-record mutation.
- Keep API keys and provider calls server-side. AI and barcode responses are
  untrusted input; present editable proposals for confirmation before saving.
- Preserve manual food/activity entry when an external provider is unavailable.
  Avoid silently changing units, serving basis, dates, or missing-value semantics.
- Keep browser-only PDF/camera code out of the Worker execution path.
- Do not add new paid services or replace the stack as incidental cleanup.
- Use synthetic records in tests. Do not read local databases, snapshots, or
  secret files just to learn the schema; read schema and existing test fixtures.
- Avoid blanket dependency upgrades. Explain the relevant compatibility issue
  and make a bounded version change when authorized.
