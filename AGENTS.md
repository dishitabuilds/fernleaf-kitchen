# Instructions for Codex: Fernleaf Kitchen

- At the start of every task or phase, read root `rules.md` and README.md if present. Follow `rules.md` throughout every change and re-read it if it changes.
- Locate the existing `blueprint.md` or `Heizen-Implementation-Blueprint.md`. Read it fully on initial setup; on later tasks read the relevant sections and the README progress/decision records. Check the original assignment when available. Do not assume attachments from another chat are in this workspace.
- Inspect the current repository and Git state before editing. Create necessary folders/files yourself while preserving existing and unrelated user work.
- Follow the phase scope requested by the user. Initially implement Phase 0, run its checks, update README, commit and push, then report. A later request may authorise more phases; preserve each phase's acceptance gate and push.
- Keep README.md current with actual setup commands, architecture and data model, decisions/trade-offs, exact dashboard definitions, priorities/skipped scope and reasons, assumptions, test evidence, demo accounts, deployment and next steps. Full requirements are in `rules.md` section 5.
- Next.js must call NestJS over HTTP. Keep Prisma and authoritative business rules in the backend. Preserve the money, calendar, permission, snapshot, grouping and transaction invariants in `rules.md`.
- After every completed phase, commit and push to the verified project GitHub remote/branch, as already authorised by the user. Verify the push and report it. If remote/authentication is missing, complete unblocked work and ask only for the missing setup. Never pretend a push succeeded or bypass protections.
- Do not mark untested, blocked or undeployed work as verified/deployed. End phase reports with actual checks, commit/push status, remaining blockers, how to try the result and the next phase.
- Follow applicable higher-priority instructions and later explicit user decisions. Do not rewrite rules to bypass a requirement.
