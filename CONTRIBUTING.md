# Contributing to Diorna

Thank you for improving Diorna. Be respectful, keep user data portable, and do
not introduce telemetry or an account dependency.

## Before a pull request

1. Discuss large product or schema changes in an issue.
2. Sign the [Contributor Licence Agreement](CLA.md) by adding your name to the
   pull request's CLA declaration.
3. Branch from `main`; keep the branch short-lived.
4. Use Conventional Commits, such as `feat(notes): add quote anchors`.
5. Add unit tests for business logic and Playwright coverage for visible flows.
6. Run `npm run check` and `npm run test:e2e` on Windows.

Pull requests are squash-merged after at least one approving review and a green
pipeline. Do not commit vault data, API keys, certificates, generated build
folders, or logs. New dependencies need a reason, a compatible licence, and an
audit of their network behaviour.

## Boundaries

Feature code stays under its module. A module exposes its public types and
services through its top-level API; other modules do not import its internal
components. The shell is the composition root. Native file, database, import,
secret, and spreadsheet operations live behind Tauri commands.

Schema migrations are forward-only. They require a migration test, a backup
path, and a recovery note. Markdown and Canvas data must remain recoverable if
the SQLite index is deleted.

## Review checklist

- Every query is scoped by workspace at construction.
- User-provided Markdown, HTML, SVG, and URLs are sanitised.
- Controls have names, focus states, keyboard paths, and useful empty states.
- Strings use localisation resources.
- No hidden network request, telemetry, or secret persistence is introduced.
- Documentation and third-party notices are updated.
