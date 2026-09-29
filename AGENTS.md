# AGENTS.md

## Mission

Build and maintain the INSPIRA Debate Club Management System according to `INSPIRA_DEEPSEEK_MASTER_SPEC.md`. That master specification is the V1 product source of truth. Work one approved phase at a time.

The product owner is a complete beginner. Speak to the owner in plain Chinese by default, define technical terms, give exact safe steps, and never assume knowledge of coding, terminals, Git, databases, DNS, cloud servers, or deployment.

## Before You Change Anything

1. Read this file and the relevant sections of `INSPIRA_DEEPSEEK_MASTER_SPEC.md` completely.
2. Inspect the repository, current changes, package manager, scripts, tests, and nearby code.
3. Identify the active build phase and its acceptance criteria.
4. Do not overwrite or revert user work. Keep unrelated changes untouched.
5. If a decision changes the data model, permissions, privacy, or workflow and is not specified, ask the product owner before implementing.

## Scope Discipline

- Implement only the active approved phase.
- Do not pre-build later phases “for convenience.” Small foundations are allowed only when directly required and documented.
- Prefer the simplest design that satisfies the specification and preserves a clean extension path.
- Do not introduce microservices, a separate backend, payment processing, parent accounts, native apps, internal messaging, or AI features in V1.
- The system proposes teams, matches, and judges; an administrator confirms them.

## Architecture Rules

- Use Next.js App Router, React, strict TypeScript, and Tailwind/shadcn. Use the database/auth/email choices approved after the Phase 0 mainland-access proof; do not silently default to a blocked or untested dependency.
- Production application compute must run in the approved explicit Hong Kong or Singapore region on Alibaba Cloud or Tencent Cloud unless a later owner-approved ADR changes this.
- Do not default production hosting to Vercel.
- Keep production browser traffic on the application's own domain where practical. Self-host fonts and static assets; do not add Google-hosted assets, public package CDNs, analytics, CAPTCHA, or other browser dependencies without mainland-China testing and approval.
- Prefer Server Components for reads. Keep Client Components small and purposeful.
- Put privileged mutations in server-only modules through Server Actions or Route Handlers.
- Validate every untrusted input with Zod.
- Keep domain logic separate from page components.
- Never expose or import the Supabase service-role key into client code.
- Store timestamps in UTC and render using the event timezone.
- Use transactions for multi-record workflow changes.
- Make retry-prone commands idempotent.

## Beginner Guidance Rules

- Separate “DeepSeek will do” from “you need to do.”
- For every owner action, explain the goal and reason, then give exact clicks/commands, expected result, and one recovery step.
- Ask for one decision or one small group of related decisions at a time; recommend a default and explain cost and risk simply.
- Obtain explicit approval before purchases, recurring charges, public launch, destructive actions, or loading real student data.
- Never ask the owner to paste secrets into chat. Explain where to store them and how to redact screenshots.
- Stop after each meaningful checkpoint and wait for confirmation.
- Maintain `OWNER_GUIDE.md` and `NEXT_STEP.md` in plain language.
- End action requests with the four-line “你现在只需要做 / 成功时你会看到 / 请回复我 / 我收到后会做” block from the master specification.

## Database and Security Rules

- Every schema change is an ordered, reviewable migration. Never rely on undocumented dashboard edits.
- Enable RLS on every exposed table and default to deny.
- Enforce permissions in the database and on the server; client guards are not security.
- Use constraints for core invariants and indexes for real access paths.
- Preserve history with snapshots. Never let a current profile/rating/team edit rewrite a completed debate.
- Never use one `role` column on profiles; accounts may have multiple roles.
- Never store passwords.
- Never mutate or delete audit rows through the application.
- Never include secrets, real student data, phone numbers, or personal email addresses in fixtures, logs, screenshots, or commits.
- Record the physical region and data location of every production dependency.

## Domain Rules

- Core model: User → Event → Registration → Participation → Team → Match → Judge Assignment → Ballot.
- Registration does not itself assign a format or match.
- Student eligibility and rating are format-specific; ratings are 1–10 and snapshotted on participation.
- One debate per event is normal, but explicit extra participation is supported.
- Team sizes and teams-per-match come from database format configuration; do not scatter hardcoded values.
- Similar-rated students should normally be partners. Accepted partner requests are strongly preferred.
- Matchmaking should avoid repeat opponents and balance sides.
- Ironman is an explicit, audited, manager-confirmed exception and counts in history.
- A match roster is locked and snapshotted when Start Debate succeeds.
- Ballots are format-specific, validated, submitted by assigned judges, and visible to students only after publication.
- Reopened/resubmitted/published ballots and operational assignment changes are audited.

## Code Quality

- Use clear domain names; avoid generic `data`, `item`, and `handleThing` names.
- Prefer small functions, explicit types, and exhaustive workflow-state handling.
- Do not use `any` without a documented, narrowly scoped reason.
- Do not swallow errors. Return safe user messages and retain actionable server diagnostics without personal data.
- Reuse shared components and domain services without creating premature abstractions.
- Add comments for business reasons and invariants, not line-by-line narration.
- Keep accessibility: semantic elements, labels, keyboard support, focus management, contrast, and text/icon status cues.

## Testing Rules

- Add or update tests with every behavior change.
- Test happy paths, invalid input, forbidden access, edge cases, and concurrency/idempotency risks.
- Pairing, matchmaking, judge assignment, and state transitions require deterministic unit fixtures.
- Permissions require real RLS/database tests for every role, including explicit denied operations.
- Major workflows require Playwright coverage.
- Mainland-China access is a release requirement. Test the first-party domain, auth, APIs, static assets, and email without a VPN using the approved test matrix.
- Run formatting, lint, TypeScript, relevant tests, and production build before declaring a phase complete.
- Never claim a command passed if it was not run. Report environmental blockers exactly.

## Working Method

1. Restate the active phase and a short implementation plan.
2. Inspect before editing.
3. Make small coherent changes.
4. Run focused checks early, then the full required phase checks.
5. Review the diff for scope, security, accessibility, and accidental files.
6. Update docs and requirement traceability.
7. Provide the completion report and stop for product-owner approval.

## Completion Report

At the end of each phase report:

- outcome and user-visible behavior;
- important files and migrations;
- decisions/deviations and why;
- checks run with pass/fail results;
- manual verification steps;
- known limitations or follow-ups;
- confirmation that docs and this file remain accurate.

Do not begin the next phase until the product owner explicitly approves it.
