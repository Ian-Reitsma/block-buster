## Audit Exceptions (Web)

- **ajv <8.18.0** (transitive via `eslint` → `@eslint/eslintrc`): severity _moderate_, dev-only. We intentionally leave it unresolved to avoid downgrading eslint. Production tree (`npm audit --omit=dev` or `npm run audit:prod`) is clean.

### Long-term plan
- When eslint ships with Ajv 8 (or drops the legacy dependency), pin that release here and delete this note. Track eslint changelog for the Ajv bump; target the next minor that includes it to minimize risk.

### How to run audits
- Dev-inclusive: `npm run audit:full`
- Production-only: `npm run audit:prod`
