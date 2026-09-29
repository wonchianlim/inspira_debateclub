# INSPIRA Debate Club Management System

## Product Requirements, Technical Blueprint, and DeepSeek Build Guide

**Document status:** V1 master specification  
**Audience:** A non-technical product owner and the DeepSeek coding assistant  
**Last updated:** 2026-09-29  
**Canonical filename:** `INSPIRA_DEEPSEEK_MASTER_SPEC.md`

---

## 0. How DeepSeek Must Use This Document

This document is the source of truth for V1. DeepSeek must not attempt to build the whole product from one prompt.

When this document is first added to a repository, DeepSeek must:

1. Read this entire document before proposing architecture or writing code.
2. Inspect the repository, package manager, existing configuration, and current tests.
3. Create a root-level file named exactly `AGENTS.md` using the content in [Appendix A](#appendix-a-required-agentsmd).
4. Read and obey `AGENTS.md` before every implementation phase.
5. Complete Phase 0 before Phase 1 and obtain explicit product-owner approval before beginning Phase 1.
6. Work in small, reviewable phases. Never silently expand scope into a later phase.
7. Use migrations for all database changes. Never make an undocumented dashboard-only schema change.
8. Implement authorization at the database and server boundaries, not only by hiding interface elements.
9. Preserve historical records, snapshot time-sensitive data, and audit privileged changes.
10. Run the required checks at the end of each phase, report failures honestly, update documentation, and stop.
11. Treat the product owner as a complete beginner. Never assume they understand coding, terminals, Git, databases, DNS, cloud servers, deployment, environment variables, or error messages.
12. Explain and guide every owner action using the beginner interaction contract below.

If this document conflicts with an explicit, later product-owner instruction, DeepSeek should follow the later instruction and update this document and the relevant decision record. If requirements remain ambiguous and the choice would materially change the data model, permissions, hosting cost, privacy, security, or workflow, DeepSeek must ask before implementing.

### 0.1 Product-owner experience level

The product owner has little or no coding or infrastructure knowledge. This is an explicit project requirement, not an incidental preference. DeepSeek is responsible for making the process understandable and safe.

DeepSeek must communicate with the product owner in plain Chinese by default unless the owner requests another language. Technical files and code may remain in English where conventional.

### 0.2 Beginner interaction contract

For every step that requires the product owner to act, DeepSeek must:

1. State the immediate goal in one sentence.
2. Explain why the step is needed in plain language.
3. Distinguish clearly between **what DeepSeek can do** and **what the owner must do**.
4. Give exact click-by-click or copy-and-paste instructions, including the page, button, field, command, and expected result.
5. Define every unavoidable technical term the first time it is used.
6. Ask only one decision or one small group of tightly related decisions at a time.
7. Show the recommended choice first, plus cost, tradeoffs, and risks in simple language.
8. Warn before any purchase, recurring charge, domain registration, destructive action, public launch, or handling of real student data, and obtain explicit approval.
9. Never ask the owner to paste passwords, private keys, API keys, database passwords, or full `.env` contents into chat. Explain where to store secrets safely.
10. Tell the owner exactly how to verify success and what evidence to send back, such as a status message or screenshot with secrets hidden.
11. If a step fails, interpret the error in plain language and give one recovery action at a time.
12. Stop after each meaningful checkpoint and wait for confirmation before proceeding.

DeepSeek must never respond only with vague directions such as “configure DNS,” “set up the database,” “deploy the app,” or “run the migration.” It must explain how to do those tasks safely.

### 0.3 Required progress files

DeepSeek must maintain these beginner-facing files from Phase 0 onward:

- `OWNER_GUIDE.md`: plain-language overview, accounts/services being used, recurring costs, how to start/stop/test the system, and who to contact for each service;
- `NEXT_STEP.md`: the current phase, what has been completed, the single next action for the owner, expected result, and recovery guidance;
- `docs/decisions/`: permanent records of important choices and their plain-language consequences;
- `docs/deployment-regions.md`: region/provider decision, data locations, monthly estimate, dependencies, and mainland-China test results;
- `docs/requirements-traceability.md`: requirement-to-phase/test mapping.

At the end of every response that requests owner action, DeepSeek must include this small block:

```text
你现在只需要做：<one concrete action>
成功时你会看到：<expected result>
请回复我：<the exact confirmation or safely redacted evidence needed>
我收到后会做：<next action DeepSeek will take>
```

---

## 1. Product Summary

INSPIRA operates a weekly online Debate Club, normally from 7:30 PM to 8:30 PM, with one shared time block. Supported formats are:

- Public Forum Debate (`PF`)
- Junior World Schools Debate (`JWSD`)
- World Schools Debate (`WSDC`)
- British Parliamentary Debate (`BP`)
- One-on-One Debate (`ONE_V_ONE`)

The current process relies on staff contacting families individually, confirming attendance, forming teams, resolving late cancellations, finding judges, monitoring rooms, collecting ballots, and later locating feedback. The V1 product will centralize this workflow in one responsive web application.

The system must:

- reduce manual work for sales and administrators;
- make each weekly club session operationally predictable;
- maintain permanent student participation and ballot history;
- let students register, check in, receive assignments, and view published ballots;
- suggest teams, matchups, and judges while keeping an administrator in control;
- show managers live room status;
- give judges standardized, format-specific ballots;
- let coaches review student history, ballots, and private notes;
- record late cancellations, no-shows, extra debates, and payment status without processing payments in V1;
- preserve an audit trail for sensitive operational changes;
- run its production application server in Hong Kong or Singapore;
- remain practically usable from mainland China without a VPN, subject to measured network tests rather than assumptions;
- avoid critical browser-side dependencies that are commonly slow, unavailable, or unpredictable from mainland China.

### 1.1 Success criteria

V1 is successful when:

- staff no longer need to contact every student manually to collect weekly attendance;
- an administrator can create and operate an event from one system;
- a student can complete registration and check-in without staff assistance;
- the system can propose workable teams and matches for every enabled format;
- last-minute exceptions can be corrected manually without corrupting history;
- judges can start a debate and submit a complete ballot;
- administrators can see which rooms are missing people, ready, started, or missing ballots;
- students and coaches can reliably retrieve published ballots later;
- permissions are enforced and tested for every role;
- mainland-China test users can load, sign in, register, check in, and open ballots on normal Chinese fixed-line and mobile networks without a VPN;
- hosting region, data location, external dependencies, monthly cost, backup status, and mainland access test results are documented for the non-technical owner.

### 1.2 V1 boundaries

V1 includes email notifications and in-app notices. It does **not** include:

- parent accounts;
- payment processing or a credit ledger;
- SMS, WeChat, or enterprise WeChat integration;
- internal direct messaging;
- skill-tag analytics or AI-generated coaching themes;
- a native mobile application;
- automatic commitment of team, match, or judge assignments without admin approval;
- a complex primary-coach or format-coach assignment engine;
- multiple campus/location modeling (all V1 events are online);
- microservices.

Extra participation is recorded as included, paid, complimentary, or payment pending. Actual collection and reconciliation remain outside the system.

---

## 2. Product Principles and Confirmed Decisions

### 2.1 System suggests; administrator confirms

The system proposes teams, matches, and judges. A Club Manager or Super Admin confirms them. Automation must never silently publish operational assignments.

### 2.2 Event registration is separate from participation

A student registers for an event, not directly for a format-specific match. They may express format preferences. The system/admin then creates one or more participations, from which teams and matches are built.

The core chain is:

`User → Event → Registration → Participation → Team → Match → Judge Assignment → Ballot`

### 2.3 One normal debate per week

A student normally receives one debate per weekly event. Extra debates are allowed on special occasions and require an entitlement record. No uniqueness rule may prevent more than one participation per student per event.

### 2.4 Format-specific eligibility and ratings

Students have a separate eligibility flag and 1–10 ability rating for each format. Coaches/admins maintain ratings. A current rating is snapshotted when a participation is created so later rating changes do not rewrite history.

### 2.5 Pair similar students

Similar ability ratings should normally become partners. This is the primary team-formation objective. Accepted partner requests are honored even if ratings differ. Students are not deliberately rotated away from stable partnerships.

### 2.6 Pairing and matchup memory

The system remembers prior teammates, opponents, sides/positions, motions/topics, judges, and results. Matchmaking should avoid repeat opponents, balance ability, and balance sides over time.

### 2.7 Exceptions remain operable

- Incomplete teams are allowed while proposals are being resolved.
- The system may propose moving a student; an administrator confirms the change.
- Administrators can always move participants between teams and rooms before the debate starts.
- Ironman participation is allowed and counts normally toward the student's debate record.
- Duplicate registration is prevented by a database constraint.
- Ineligible format choices are rejected at the server/database workflow boundary.

### 2.8 Check-in and room state

Check-in opens 30 minutes before the event. Students use a simple **Check In** action; staff can check them in manually. At the warning time (normally 7:20 PM), missing participants or judges are flagged. At start time, unresolved rooms become critical.

Operational colors are presentation only; the database stores semantic states:

- neutral: scheduled, before warning;
- warning: someone missing after warning time;
- ready: all required participants and a judge are present;
- live: judge selected **Start Debate**;
- complete: ballot submitted/published;
- cancelled: match cancelled.

### 2.9 Judge workflow

Judges sign up for the event, not a specific format. Admin approves availability and the system recommends assignments based on format qualifications, conflicts, repeated exposure, and availability. Admin confirms the assignment. Judge paradigms are visible to students and judges may edit their own profiles/paradigms.

### 2.10 Ballot lifecycle

Ballots are format-specific, have required numeric and written fields, and are not visible to students immediately after submission. An administrator reviews and publishes them. Both teams can see the full published ballot and judge identity.

If a submitted ballot contains the wrong winner, the judge contacts an administrator. The administrator reopens it, the judge edits and resubmits it, and the audit log records the change. Names and lineups may update until **Start Debate**; the match roster is then locked and snapshotted.

If a ballot is overdue, the system both emails the judge and flags the match on the admin dashboard. Students may submit a simple review request in V1; it does not directly alter a ballot.

### 2.11 Roles

V1 uses five application roles:

`student`, `judge`, `coach`, `club_manager`, `super_admin`

One account may have multiple roles. Roles are stored in a join table, not as one field on a user profile.

---

## 3. User Stories and Acceptance Criteria

### 3.1 Student

A student can:

- create an account, sign in, reset a password, and maintain basic profile data;
- see open events and register once per event;
- rank or select acceptable format preferences only from eligible, enabled formats;
- request a partner and respond to a partner request;
- cancel registration, with the system distinguishing timely and late cancellation;
- check in during the check-in window;
- see the confirmed team, opponents, side/position, room/link, judge, and judge paradigm;
- receive email and in-app event reminders and assignment updates;
- view participation history and published ballots;
- submit one review request for a published ballot.

Students must never see draft/unpublished ballots, coach notes, other students' private profiles, or administrative audit data.

### 3.2 Judge

A judge can:

- register an account and maintain a profile/paradigm;
- declare availability for an event;
- see approval and assignment status;
- view only assigned match rosters and relevant event details;
- check in/indicate readiness;
- start an assigned debate, recording the time and locking its roster;
- save a ballot draft;
- submit only when all format-specific required fields pass validation;
- edit a submitted ballot only after an administrator reopens it;
- see their judging history.

Judges cannot assign themselves to matches, publish ballots, change results outside their own reopened ballot, or access unrelated student records.

### 3.3 Coach

A coach can:

- browse student profiles, participation history, and published ballots as permitted by admin;
- maintain format-specific eligibility and ratings if granted this operational permission;
- create and edit private coach notes;
- see weekly student participation summaries.

V1 does not implement coach-to-student ownership. Coach access is role-based and controlled by administrative policy. Coach notes are never visible to students or judges.

### 3.4 Club Manager

A Club Manager can:

- create, clone, edit, and operate events;
- enable formats and publish notices;
- manage registrations and manual check-in;
- review late cancellations and no-shows;
- generate, edit, confirm, and publish team/match proposals;
- drag/move participants between teams and matches before start;
- approve judge availability and confirm assignments;
- monitor live room readiness and overdue starts/ballots;
- reopen, review, and publish ballots;
- resolve ballot review requests;
- view the audit log, but not edit or delete it.

A Club Manager cannot grant `super_admin`, change system-wide security configuration, or edit/delete audit records.

### 3.5 Super Admin

A Super Admin has all Club Manager abilities and can additionally:

- manage user status and role grants;
- approve/suspend judges and maintain judge qualifications;
- manage debate formats and system settings;
- grant coach/manager roles;
- access all operational and audit data.

No user, including Super Admin through the ordinary application, may update or delete an audit log row.

---

## 4. Roles and Permissions Matrix

Legend: `Own` means the user's own record; `Assigned` means an assigned match; `Published` excludes drafts; `Manage` includes create/update within workflow rules.

| Capability | Student | Judge | Coach | Club Manager | Super Admin |
|---|---:|---:|---:|---:|---:|
| Edit own basic profile | Yes | Yes | Yes | Yes | Yes |
| Self-register for open event | Own | Judge availability | No | Manage | Manage |
| Student check-in | Own | No | No | Manage | Manage |
| View confirmed assignment | Own | Assigned | Yes | All | All |
| View judge paradigm | Own match | Own | Yes | All | All |
| Maintain student eligibility/rating | No | No | If permitted | Yes | Yes |
| Create team/match proposals | No | No | No | Yes | Yes |
| Confirm/move teams or matches | No | No | No | Yes | Yes |
| Approve/assign judges | No | No | No | Yes | Yes |
| Start match | No | Assigned | No | Emergency override | Emergency override |
| Draft/submit ballot | No | Assigned | No | No | No |
| Reopen ballot | No | No | No | Yes | Yes |
| Publish ballot | No | No | No | Yes | Yes |
| View ballot | Published, own | Own | Published | All | All |
| Request ballot review | Own | No | No | View/resolve | View/resolve |
| Private coach notes | No | No | Manage | View | Manage |
| Post notices | No | No | No | Manage | Manage |
| Grant administrative roles | No | No | No | No | Yes |
| View audit log | No | No | No | Yes | Yes |
| Mutate audit log | No | No | No | No | No |

Authorization rules must be implemented in PostgreSQL Row Level Security (RLS) and verified again in trusted server-side actions. Client-side route guards are a usability layer only.

---

## 5. Technical Architecture

### 5.1 Recommended stack

- **Application:** Next.js App Router, React, TypeScript with strict mode
- **Styling/UI:** Tailwind CSS and shadcn/ui
- **Backend boundary:** Next.js Server Actions and Route Handlers
- **Database/Auth starting point:** Managed Supabase in its specific Singapore region, subject to the Phase 0 mainland-access proof; self-hosting is not the default for a beginner
- **Authentication:** Supabase Auth, email/password, password reset email, with critical browser flows kept behind the application's own domain where technically practical
- **Authorization:** PostgreSQL RLS plus server-side capability checks
- **Email:** A provider selected only after delivery tests to common Chinese mailboxes; Resend is a candidate, not an automatic commitment
- **Production application hosting:** Alibaba Cloud or Tencent Cloud in Hong Kong or Singapore; Hong Kong is the first benchmark candidate, not a guaranteed winner
- **Deployment format:** A reproducible Docker image on a Linux cloud server or an approved managed container service in the selected region
- **DNS/TLS:** A custom domain with HTTPS and DNS that is tested from mainland China
- **Validation:** Zod at every untrusted input boundary
- **Unit/integration tests:** Vitest
- **UI tests:** React Testing Library
- **End-to-end tests:** Playwright
- **Code quality:** ESLint, Prettier, TypeScript compiler

Use the latest stable, mutually compatible versions available when the project is initialized. Lock versions in the package lockfile. Do not introduce a separate backend, ORM, state-management library, queue, background service, CDN, analytics service, CAPTCHA, font host, or other runtime dependency without a concrete need, a mainland-China accessibility check, and product-owner approval.

The production deployment is **not Vercel by default**. The deployment decision must satisfy the region and mainland-access requirements. Managed Supabase offers a specific Singapore region but not a Hong Kong managed region as of this document's update. If the Phase 0 proof shows that a critical Supabase endpoint is unreliable from mainland China, DeepSeek must stop and present two understandable alternatives before Phase 1:

1. host the entire Supabase stack in the chosen Hong Kong/Singapore environment, explaining that the owner becomes responsible for updates, security, backups, monitoring, and recovery; or
2. replace Supabase with a simpler same-region managed PostgreSQL and authentication design, documenting all schema/security changes.

DeepSeek must recommend one option with a plain-language reason, cost estimate, operational burden, and migration risk. It must not make this infrastructure decision silently.

### 5.2 Application shape

Use one responsive application with role-aware navigation. Prefer Server Components for read-heavy pages and small Client Components for interactive controls. Privileged writes must go through server-only modules. Never expose the Supabase service-role key to the browser. Where possible, the browser should communicate only with the application's custom domain; server-side code communicates with database, authentication, and email providers. This reduces, but does not eliminate, cross-border dependency risk.

Suggested source organization:

```text
app/
  (auth)/
  (app)/
    student/
    judge/
    coach/
    manage/
    admin/
  api/
components/
  ui/
  domain/
lib/
  auth/
  permissions/
  supabase/
  validation/
  email/
  audit/
  domain/
    events/
    pairing/
    matchmaking/
    judges/
    ballots/
supabase/
  migrations/
  seed.sql
tests/
  unit/
  integration/
  e2e/
docs/
```

The exact structure may adapt to an existing repository, but domain logic must remain separate from page rendering.

### 5.3 Environment variables

Provide `.env.example` containing names but no secrets. Expected variables include:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
NEXT_PUBLIC_APP_URL=
```

Validate required server environment variables at startup. Secrets must never be committed, logged, returned to the client, or copied into documentation.

### 5.4 Hong Kong/Singapore deployment and mainland-China access

#### Region requirements

- Production application compute must physically run in Hong Kong or Singapore.
- Database, authentication, file storage, email, monitoring, DNS, and backup locations must each be documented. “The app is in Hong Kong” is not enough if essential services are elsewhere.
- Do not use a general “Asia” region when the provider cannot guarantee the actual jurisdiction. Select an explicit region.
- Keep application compute and primary database in the same region when possible. If they are in different regions, measure latency and document the reason.
- Hong Kong should be benchmarked first because of proximity, but the final choice must be based on real tests, provider availability, cost, legal review, and operational support.

#### Accessibility rules

Hosting outside mainland China does not guarantee stable access from mainland China. Before full implementation, Phase 0 must deploy a minimal proof page and authentication/API check to each shortlisted environment.

The production browser experience must not require runtime access to:

- Google Fonts, Google Analytics, Google reCAPTCHA, or other Google-hosted assets;
- GitHub, npm, unpkg, jsDelivr, or public package CDNs;
- third-party JavaScript, fonts, images, maps, chat widgets, or analytics that have not passed mainland tests;
- a provider's temporary preview domain.

Bundle JavaScript/CSS with the application, self-host fonts and static assets, serve first-party assets from the selected application domain, and use system fonts until a self-hosted brand font is approved. Build-time developer downloads may use external registries; production page loads must not depend on them.

#### Required proof-of-access test

Before Phase 1, DeepSeek must guide the owner through a low-cost proof that tests:

1. DNS resolution and HTTPS certificate from mainland China;
2. home page load without a VPN;
3. JavaScript, CSS, icons, and fonts loading with no blocked third-party request;
4. sign-up, sign-in, sign-out, password reset, and session refresh;
5. one authenticated API read and write;
6. email delivery to at least two commonly used Chinese mailbox providers;
7. representative desktop and mobile devices;
8. at least two mainland networks where practical, ideally including one fixed-line ISP and one mobile network;
9. latency, failure rate, browser console/network errors, and a repeated test at a second time of day.

Record the date, city/province, ISP, device, result, and redacted evidence in `docs/deployment-regions.md`. A one-time successful page load is insufficient. Any critical flow failure blocks the hosting decision.

#### CDN and ICP caution

- A Hong Kong or Singapore server generally does not use mainland-China hosting resources and therefore is not the same as deploying a website on a mainland server. However, legal and filing obligations depend on the actual service, entity, content, users, and network resources.
- Do not enable mainland-China CDN nodes or move production into mainland China without checking current ICP/PSB filing requirements and obtaining qualified advice.
- A non-mainland deployment may be slower or less predictable because traffic crosses the border. Global acceleration products may require additional contracts or cross-border qualification.
- “Accessible from China” is an engineering acceptance test, not a promise that a site can never be filtered or disrupted.

#### Privacy and minors

The system stores information about students, potentially including minors, and may move data across jurisdictions. Before real student data is used, obtain a qualified privacy/legal review covering consent, privacy notice, retention, access control, incident response, and cross-border data handling relevant to China, Hong Kong, and/or Singapore. DeepSeek may prepare a checklist but must not claim legal compliance.

### 5.5 Time and localization

- Store timestamps as `TIMESTAMPTZ` in UTC.
- Display event times in the event timezone, defaulting to `Asia/Shanghai`.
- Store `timezone` on each event even though V1 uses one timezone.
- Compute late cancellation, warning, and overdue behavior from timestamps, not browser-local assumptions.

### 5.6 Reliability and concurrency

Use database transactions or PostgreSQL functions for multi-row operations such as confirming pairings, moving a participant, locking a roster, submitting a ballot, and publishing a ballot. Use constraints as the final defense against duplicate registration, duplicate roles, duplicate assignments, and invalid ratings.

Important mutations should be idempotent where practical. Double-clicking registration, check-in, start, submit, or publish must not create duplicate records.

---

## 6. Database Schema

All primary keys are UUIDs generated by the database. All mutable tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` unless explicitly append-only. Foreign keys need deliberate `ON DELETE` behavior: historical/operational data should normally use `RESTRICT`; dependent draft-only records may use `CASCADE` where safe.

Use PostgreSQL enums only for stable workflow states. Use lookup tables or checked text for concepts likely to grow. Add comments to non-obvious tables and columns.

### 6.1 Identity and roles

#### `profiles`

```text
id UUID PRIMARY KEY REFERENCES auth.users(id)
first_name TEXT NOT NULL
last_name TEXT NOT NULL
display_name TEXT NOT NULL
email TEXT NOT NULL
phone TEXT NULL
avatar_url TEXT NULL
status profile_status NOT NULL DEFAULT 'active'
created_at, updated_at
```

`profile_status`: `active`, `inactive`, `suspended`.

The profile UUID should equal the Supabase Auth user UUID to simplify RLS. Do not store passwords.

#### `user_roles`

```text
id UUID PRIMARY KEY
profile_id UUID NOT NULL REFERENCES profiles(id)
role app_role NOT NULL
created_by UUID NULL REFERENCES profiles(id)
created_at
UNIQUE (profile_id, role)
```

`app_role`: `student`, `judge`, `coach`, `club_manager`, `super_admin`.

#### `student_profiles`

```text
id UUID PRIMARY KEY
profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id)
school TEXT NULL
grade TEXT NULL
notes TEXT NULL
active BOOLEAN NOT NULL DEFAULT true
created_at, updated_at
```

Do not store debate ratings here. Reliability totals should be queried from registration history rather than maintained as mutable counters.

#### `judge_profiles`

```text
id UUID PRIMARY KEY
profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id)
approval_status judge_approval_status NOT NULL DEFAULT 'pending'
paradigm TEXT NULL
experience_notes TEXT NULL
created_at, updated_at
```

`judge_approval_status`: `pending`, `approved`, `rejected`, `suspended`.

### 6.2 Formats and qualifications

#### `debate_formats`

```text
id UUID PRIMARY KEY
code TEXT NOT NULL UNIQUE
name TEXT NOT NULL
team_size SMALLINT NOT NULL CHECK (team_size > 0)
teams_per_match SMALLINT NOT NULL CHECK (teams_per_match > 1)
active BOOLEAN NOT NULL DEFAULT true
display_order SMALLINT NOT NULL
created_at, updated_at
```

Seed:

| Code | Name | Team size | Teams per match |
|---|---|---:|---:|
| PF | Public Forum Debate | 2 | 2 |
| JWSD | Junior World Schools Debate | 3 | 2 |
| WSDC | World Schools Debate | 3 | 2 |
| BP | British Parliamentary Debate | 2 | 4 |
| ONE_V_ONE | One-on-One Debate | 1 | 2 |

Never hardcode team sizes or teams-per-match throughout application code.

#### `student_format_profiles`

```text
id UUID PRIMARY KEY
student_id UUID NOT NULL REFERENCES student_profiles(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
eligible BOOLEAN NOT NULL DEFAULT false
rating SMALLINT NULL CHECK (rating BETWEEN 1 AND 10)
updated_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
UNIQUE (student_id, format_id)
CHECK ((eligible = false) OR (rating IS NOT NULL))
```

#### `judge_format_qualifications`

```text
id UUID PRIMARY KEY
judge_id UUID NOT NULL REFERENCES judge_profiles(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
approved BOOLEAN NOT NULL DEFAULT false
approved_by UUID NULL REFERENCES profiles(id)
approved_at TIMESTAMPTZ NULL
created_at, updated_at
UNIQUE (judge_id, format_id)
```

### 6.3 Events, notices, and registration

#### `events`

```text
id UUID PRIMARY KEY
title TEXT NOT NULL
event_date DATE NOT NULL
timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai'
registration_opens_at TIMESTAMPTZ NOT NULL
registration_closes_at TIMESTAMPTZ NOT NULL
check_in_opens_at TIMESTAMPTZ NOT NULL
warning_at TIMESTAMPTZ NOT NULL
starts_at TIMESTAMPTZ NOT NULL
ends_at TIMESTAMPTZ NOT NULL
status event_status NOT NULL DEFAULT 'draft'
meeting_url TEXT NULL
notice TEXT NULL
created_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
CHECK (registration_opens_at < registration_closes_at)
CHECK (registration_closes_at <= starts_at)
CHECK (check_in_opens_at <= starts_at)
CHECK (warning_at <= starts_at)
CHECK (starts_at < ends_at)
```

`event_status`: `draft`, `registration_open`, `registration_closed`, `pairing`, `ready`, `live`, `completed`, `archived`, `cancelled`.

#### `event_formats`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
enabled BOOLEAN NOT NULL DEFAULT true
motion TEXT NULL
created_at, updated_at
UNIQUE (event_id, format_id)
```

#### `notices`

```text
id UUID PRIMARY KEY
title TEXT NOT NULL
body TEXT NOT NULL
audience_type TEXT NOT NULL CHECK (audience_type IN ('global','event','role','format'))
event_id UUID NULL REFERENCES events(id)
role app_role NULL
format_id UUID NULL REFERENCES debate_formats(id)
published_at TIMESTAMPTZ NULL
expires_at TIMESTAMPTZ NULL
created_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
```

Add a check constraint ensuring the targeting column appropriate to `audience_type` is populated and irrelevant targeting columns are null.

#### `registrations`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
student_id UUID NOT NULL REFERENCES student_profiles(id)
status registration_status NOT NULL DEFAULT 'registered'
registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
cancelled_at TIMESTAMPTZ NULL
checked_in_at TIMESTAMPTZ NULL
check_in_method check_in_method NULL
created_at, updated_at
UNIQUE (event_id, student_id)
```

`registration_status`: `registered`, `cancelled`, `late_cancelled`, `checked_in`, `no_show`.  
`check_in_method`: `self`, `admin`.

#### `registration_format_preferences`

```text
id UUID PRIMARY KEY
registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE
format_id UUID NOT NULL REFERENCES debate_formats(id)
preference_rank SMALLINT NOT NULL CHECK (preference_rank > 0)
created_at
UNIQUE (registration_id, format_id)
UNIQUE (registration_id, preference_rank)
```

Only formats that are enabled for the event and eligible for the student may be saved.

#### `partner_requests`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
format_id UUID NULL REFERENCES debate_formats(id)
requester_student_id UUID NOT NULL REFERENCES student_profiles(id)
requested_student_id UUID NOT NULL REFERENCES student_profiles(id)
status partner_request_status NOT NULL DEFAULT 'pending'
created_at, updated_at
CHECK (requester_student_id <> requested_student_id)
```

`partner_request_status`: `pending`, `accepted`, `unavailable`, `replaced`, `cancelled`.

Enforce at most one active request for the same requester/event/format. An accepted request is a strong pairing preference, not a guarantee if one student becomes unavailable.

### 6.4 Participation, teams, and matches

#### `participations`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
student_id UUID NOT NULL REFERENCES student_profiles(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
participation_number SMALLINT NOT NULL DEFAULT 1 CHECK (participation_number > 0)
entitlement_type entitlement_type NOT NULL DEFAULT 'weekly_entitlement'
rating_snapshot SMALLINT NOT NULL CHECK (rating_snapshot BETWEEN 1 AND 10)
status participation_status NOT NULL DEFAULT 'proposed'
created_at, updated_at
UNIQUE (event_id, student_id, participation_number)
```

`entitlement_type`: `weekly_entitlement`, `extra_paid`, `extra_complimentary`, `extra_payment_pending`.  
`participation_status`: `proposed`, `confirmed`, `completed`, `cancelled`.

Do not add a unique constraint on only `(event_id, student_id)`.

#### `teams`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
team_label TEXT NULL
status team_status NOT NULL DEFAULT 'proposed'
average_rating NUMERIC(4,2) NULL
created_at, updated_at
```

`team_status`: `proposed`, `confirmed`, `dissolved`.

#### `team_members`

```text
id UUID PRIMARY KEY
team_id UUID NOT NULL REFERENCES teams(id)
participation_id UUID NOT NULL REFERENCES participations(id)
speaker_position SMALLINT NULL CHECK (speaker_position > 0)
is_ironman BOOLEAN NOT NULL DEFAULT false
created_at, updated_at
UNIQUE (team_id, participation_id)
UNIQUE (team_id, speaker_position)
```

Server logic must ensure a participation is on at most one non-dissolved team and team/event/format values agree.

#### `matches`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
format_id UUID NOT NULL REFERENCES debate_formats(id)
match_number SMALLINT NOT NULL CHECK (match_number > 0)
room_name TEXT NOT NULL
meeting_url TEXT NULL
scheduled_start TIMESTAMPTZ NOT NULL
status match_status NOT NULL DEFAULT 'scheduled'
started_at TIMESTAMPTZ NULL
ballot_submitted_at TIMESTAMPTZ NULL
published_at TIMESTAMPTZ NULL
roster_locked_at TIMESTAMPTZ NULL
ironman BOOLEAN NOT NULL DEFAULT false
created_at, updated_at
UNIQUE (event_id, format_id, match_number)
UNIQUE (event_id, room_name)
```

`match_status`: `scheduled`, `missing_participant`, `ready`, `started`, `ballot_submitted`, `published`, `cancelled`.

#### `match_teams`

```text
id UUID PRIMARY KEY
match_id UUID NOT NULL REFERENCES matches(id)
team_id UUID NOT NULL REFERENCES teams(id)
position TEXT NOT NULL
result TEXT NULL
placement SMALLINT NULL
created_at, updated_at
UNIQUE (match_id, team_id)
UNIQUE (match_id, position)
```

Allowed positions are validated in domain logic using the format:

- PF/JWSD/WSDC/ONE_V_ONE: `PROP`, `OPP`
- BP: `OG`, `OO`, `CG`, `CO`

Do not use one rigid database enum for format-specific positions.

#### `match_roster_snapshots`

Append-only rows created atomically when the judge starts a match:

```text
id UUID PRIMARY KEY
match_id UUID NOT NULL REFERENCES matches(id)
team_id UUID NOT NULL REFERENCES teams(id)
participation_id UUID NOT NULL REFERENCES participations(id)
student_id UUID NOT NULL REFERENCES student_profiles(id)
student_display_name TEXT NOT NULL
team_label TEXT NULL
position TEXT NOT NULL
speaker_position SMALLINT NULL
rating_snapshot SMALLINT NOT NULL
is_ironman BOOLEAN NOT NULL
created_at
UNIQUE (match_id, participation_id, position)
```

Ballot rendering uses this snapshot after start, preventing later profile/team edits from rewriting the historical ballot roster.

#### `match_motions`

```text
id UUID PRIMARY KEY
match_id UUID NOT NULL REFERENCES matches(id)
motion_text TEXT NOT NULL
released_at TIMESTAMPTZ NULL
created_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
```

### 6.5 Judges

#### `judge_event_availability`

```text
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
judge_id UUID NOT NULL REFERENCES judge_profiles(id)
status judge_availability_status NOT NULL DEFAULT 'offered'
signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
approved_at TIMESTAMPTZ NULL
checked_in_at TIMESTAMPTZ NULL
created_at, updated_at
UNIQUE (event_id, judge_id)
```

`judge_availability_status`: `offered`, `approved`, `unavailable`, `assigned`.

#### `judge_assignments`

```text
id UUID PRIMARY KEY
match_id UUID NOT NULL REFERENCES matches(id)
judge_id UUID NOT NULL REFERENCES judge_profiles(id)
role judge_assignment_role NOT NULL DEFAULT 'chair'
status judge_assignment_status NOT NULL DEFAULT 'assigned'
assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
assigned_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
UNIQUE (match_id, judge_id)
```

`judge_assignment_role`: `chair`, `panelist`.  
`judge_assignment_status`: `assigned`, `accepted`, `completed`, `cancelled`.

V1 normally uses one chair but must not prevent future panels. Prevent one active judge from being assigned to simultaneous matches.

### 6.6 Ballots and review requests

Do not create five unrelated ballot systems. Use shared tables plus a versioned format-specific schema.

#### `ballot_templates`

```text
id UUID PRIMARY KEY
format_id UUID NOT NULL REFERENCES debate_formats(id)
version INTEGER NOT NULL CHECK (version > 0)
name TEXT NOT NULL
schema JSONB NOT NULL
active BOOLEAN NOT NULL DEFAULT true
created_by UUID NOT NULL REFERENCES profiles(id)
created_at, updated_at
UNIQUE (format_id, version)
```

The JSON schema describes format-specific fields and required validation. It is configuration, not a dumping ground for all ballot data.

#### `ballots`

```text
id UUID PRIMARY KEY
match_id UUID NOT NULL REFERENCES matches(id)
judge_id UUID NOT NULL REFERENCES judge_profiles(id)
template_id UUID NOT NULL REFERENCES ballot_templates(id)
status ballot_status NOT NULL DEFAULT 'draft'
winner_team_id UUID NULL REFERENCES teams(id)
reason_for_decision TEXT NULL
format_data JSONB NOT NULL DEFAULT '{}'
submitted_at TIMESTAMPTZ NULL
reopened_at TIMESTAMPTZ NULL
resubmitted_at TIMESTAMPTZ NULL
published_at TIMESTAMPTZ NULL
reopened_by UUID NULL REFERENCES profiles(id)
published_by UUID NULL REFERENCES profiles(id)
created_at, updated_at
UNIQUE (match_id, judge_id)
```

`ballot_status`: `draft`, `submitted`, `reopened`, `resubmitted`, `published`.

#### `ballot_scores`

```text
id UUID PRIMARY KEY
ballot_id UUID NOT NULL REFERENCES ballots(id) ON DELETE CASCADE
participation_id UUID NOT NULL REFERENCES participations(id)
score_type TEXT NOT NULL
score_value NUMERIC NOT NULL
created_at, updated_at
UNIQUE (ballot_id, participation_id, score_type)
```

Examples: WSDC `content`, `style`, `strategy`, `total`; PF `speaker_points`; BP `speaker_score`.

#### `ballot_feedback`

```text
id UUID PRIMARY KEY
ballot_id UUID NOT NULL REFERENCES ballots(id) ON DELETE CASCADE
target_type TEXT NOT NULL CHECK (target_type IN ('student','team','match'))
target_id UUID NULL
feedback_type TEXT NOT NULL CHECK (feedback_type IN ('individual','team','overall'))
feedback_text TEXT NOT NULL
created_at, updated_at
```

Validate that `target_id` refers to an entity on the ballot's match.

#### `ballot_review_requests`

```text
id UUID PRIMARY KEY
ballot_id UUID NOT NULL REFERENCES ballots(id)
requested_by_student_id UUID NOT NULL REFERENCES student_profiles(id)
reason TEXT NOT NULL
status review_request_status NOT NULL DEFAULT 'open'
admin_response TEXT NULL
resolved_at TIMESTAMPTZ NULL
resolved_by UUID NULL REFERENCES profiles(id)
created_at, updated_at
UNIQUE (ballot_id, requested_by_student_id)
```

`review_request_status`: `open`, `reviewing`, `resolved`, `rejected`.

### 6.7 Coaching, notifications, and audit

#### `coach_notes`

```text
id UUID PRIMARY KEY
student_id UUID NOT NULL REFERENCES student_profiles(id)
coach_profile_id UUID NOT NULL REFERENCES profiles(id)
note TEXT NOT NULL
created_at, updated_at
```

#### `notifications`

```text
id UUID PRIMARY KEY
profile_id UUID NOT NULL REFERENCES profiles(id)
type TEXT NOT NULL
title TEXT NOT NULL
message TEXT NOT NULL
link TEXT NULL
read_at TIMESTAMPTZ NULL
created_at
```

#### `email_jobs`

```text
id UUID PRIMARY KEY
recipient_profile_id UUID NOT NULL REFERENCES profiles(id)
email_type TEXT NOT NULL
status email_job_status NOT NULL DEFAULT 'pending'
payload JSONB NOT NULL DEFAULT '{}'
scheduled_for TIMESTAMPTZ NOT NULL
sent_at TIMESTAMPTZ NULL
failure_reason TEXT NULL
dedupe_key TEXT NOT NULL UNIQUE
attempt_count SMALLINT NOT NULL DEFAULT 0
created_at, updated_at
```

`email_job_status`: `pending`, `processing`, `sent`, `failed`, `cancelled`.

The initial implementation may dispatch through a protected scheduled endpoint, but it must be idempotent and observable.

#### `audit_logs`

```text
id UUID PRIMARY KEY
actor_profile_id UUID NULL REFERENCES profiles(id)
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
action TEXT NOT NULL
old_value JSONB NULL
new_value JSONB NULL
request_id UUID NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

This table is append-only. No ordinary application role has update/delete permission. Sensitive changes include ratings, eligibility, roles, teams, match rosters, judge assignments, manual check-in, results, ballot reopen/resubmit/publish, and review resolution.

### 6.8 Required indexes

At minimum, index:

- all foreign keys used in joins;
- `events(status, starts_at)`;
- `registrations(event_id, status)`;
- `participations(event_id, format_id, status)`;
- `teams(event_id, format_id, status)`;
- `matches(event_id, format_id, status)`;
- `judge_event_availability(event_id, status)`;
- `judge_assignments(judge_id, status)`;
- `ballots(status, submitted_at)`;
- `notifications(profile_id, read_at, created_at DESC)`;
- `email_jobs(status, scheduled_for)`;
- `audit_logs(entity_type, entity_id, created_at DESC)`.

Add indexes based on measured query plans rather than speculation beyond this baseline.

---

## 7. RLS and Security Requirements

Enable RLS on every table exposed through Supabase. Default to deny. Use small helper functions such as `has_role(role)` and `is_manager()` implemented as carefully reviewed `SECURITY DEFINER` functions with a fixed `search_path`.

Core policy expectations:

- A user can read/update their own `profiles` row, but cannot change status or roles.
- Students can read/update their own registration within workflow windows and read only their own participation/history.
- Students can read a ballot only when it is `published` and they appear in that match roster.
- Judges can read matches assigned to them and read/write their own ballot under valid lifecycle states.
- Coaches can read student operational/history data and write their own coach notes; students and judges have no access to coach notes.
- Managers can manage events and operational data, but only Super Admin can grant roles or maintain system-level format/judge qualifications.
- Nobody can update/delete `audit_logs` through the application API.
- Service-role usage is server-only, narrowly scoped, and never used as a shortcut around authorization.

Security tests must attempt forbidden reads and writes, not merely confirm allowed operations.

Additional protections:

- Validate all form/action/route inputs with Zod.
- Use generated typed database definitions.
- Escape/render user text safely; never inject ballot feedback or notices as raw HTML.
- Avoid logging phone numbers, email contents, auth tokens, or ballot content in production logs.
- Rate-limit authentication-adjacent, review-request, and email-trigger endpoints.
- Use CSRF-safe framework conventions for mutations and verify authenticated identity server-side.
- Keep privileged mutation functions in server-only modules.

---

## 8. Application Routes

Public/authentication:

```text
/login
/register
/forgot-password
/reset-password
```

Shared authenticated:

```text
/dashboard                    role-aware redirect/overview
/events                       visible event list
/events/[eventId]             permission-aware event overview
/notifications
/profile
```

Student:

```text
/student
/student/events
/student/events/[eventId]
/student/history
/student/ballots
/student/ballots/[ballotId]
/student/profile
```

Judge:

```text
/judge
/judge/events
/judge/assignments
/judge/matches/[matchId]
/judge/ballots/[ballotId]
/judge/history
/judge/profile
```

Coach:

```text
/coach
/coach/students
/coach/students/[studentId]
/coach/students/[studentId]/ballots/[ballotId]
/coach/notes
```

Club management:

```text
/manage
/manage/events
/manage/events/new
/manage/events/[eventId]
/manage/events/[eventId]/registrations
/manage/events/[eventId]/check-in
/manage/events/[eventId]/formats/[formatCode]
/manage/events/[eventId]/pairing
/manage/events/[eventId]/judges
/manage/events/[eventId]/live
/manage/events/[eventId]/ballots
/manage/events/[eventId]/reviews
/manage/notices
/manage/audit
```

Super Admin:

```text
/admin
/admin/users
/admin/users/[profileId]
/admin/roles
/admin/formats
/admin/judges
/admin/settings
/admin/audit
```

Each format gets a separate operations view under `/manage/events/[eventId]/formats/[formatCode]`, as requested. Shared components and domain logic must prevent duplication.

Route access must be checked on the server. Unauthorized users receive a safe 403/redirect without leaking whether a protected record exists.

---

## 9. Weekly Workflow and State Transitions

### 9.1 Event lifecycle

```text
draft → registration_open → registration_closed → pairing → ready → live → completed → archived
```

An event may transition to `cancelled` before completion. Invalid transitions return a domain error and do not partially mutate records.

### 9.2 Registration

1. Manager creates or clones an event and enables formats.
2. Manager opens registration; students receive an email/in-app notice.
3. Student registers once and ranks eligible format preferences.
4. Student may request a partner.
5. Before the deadline, cancellation becomes `cancelled`; after it, `late_cancelled`.
6. Registration closes automatically by timestamp even if a scheduled status update has not run.
7. Managers review unresolved eligibility/preferences before pairing.

### 9.3 Pairing and match publication

1. System creates a deterministic proposal for participations and teams.
2. Manager reviews warnings, incomplete teams, and extra participation entitlements.
3. Manager edits and confirms teams.
4. System proposes matches and sides/positions.
5. Manager edits rooms, confirms matches, and publishes assignments.
6. Students receive assignment notifications.

Persist proposal inputs, scores, warnings, and algorithm version so an administrator can understand why a suggestion was made.

### 9.4 Check-in and live operations

1. Check-in opens 30 minutes before start.
2. Student selects **Check In**; manager can check in manually.
3. Judge indicates readiness/check-in.
4. At warning time, dashboard marks rooms with missing people/judges.
5. Manager contacts families or resolves the roster manually.
6. When all required people are present, the match is `ready`.
7. Judge selects **Start Debate**. The operation atomically verifies assignment/roster, creates roster snapshots, sets `started_at` and `roster_locked_at`, changes status to `started`, and makes the ballot editable.
8. If start is overdue, the dashboard flags the room.

### 9.5 Ballot lifecycle

```text
draft → submitted → published
             ↓
          reopened → resubmitted → published
```

- Ballot submission is sufficient to mark the debate finished.
- Submission validates the template, winner/placements, scores, and written feedback.
- Submitted/resubmitted ballots are read-only for judges.
- Manager review may correct presentation-only typos through an explicitly audited workflow, but must not silently change the judge's decision.
- Reopening records actor, time, reason, and before/after values.
- Publication atomically sets ballot and match publication timestamps and queues notifications.

---

## 10. Pairing and Matchmaking Logic

V1 uses a transparent deterministic heuristic, not machine learning. The system proposes; the manager confirms.

### 10.1 Required inputs

For each registered, available student:

- eligible enabled formats;
- ordered format preferences;
- 1–10 rating per format;
- accepted partner request, if any;
- prior teammate and opponent counts;
- recent side/position history;
- current event participation count and entitlement;
- check-in/availability state when rerunning on event day.

### 10.2 Allocation to formats

Allocate the student's normal participation to the highest preference that is eligible, enabled, and contributes to a viable group. Optimize globally rather than greedily assigning every first preference if that would strand many students.

Primary objectives, in order:

1. maximize students receiving one valid debate;
2. avoid eligibility violations;
3. maximize complete teams and complete matches;
4. honor higher format preferences;
5. minimize the number of admin warnings/moves;
6. assign extra debates only when the entitlement type is explicitly selected.

Every non-obvious allocation produces a warning explaining the tradeoff.

### 10.3 Team formation

For each format:

1. Lock accepted, mutually available partner groups if group size is legal.
2. Sort remaining students by `rating_snapshot`, then stable student UUID for deterministic ties.
3. Generate candidate groups of `team_size`.
4. Score each candidate:

```text
team_cost =
  1000 * eligibility_violation
  + 500 * unavailable_student
  + 100 * incomplete_team
  + 10 * rating_range
  + 4 * rating_standard_deviation
  + 2 * repeated_teammate_penalty
  - 50 * accepted_partner_bonus
```

Eligibility/unavailability are hard constraints in ordinary generation; their large weights document priority for exceptional/manual analysis. Lower cost is better.

5. Select the set of non-overlapping candidate teams with the lowest total cost.
6. Flag remainders and propose the smallest movement between formats that improves viability.

The goal is similar-rated partners. Repeat teammate history is only a light penalty because stable partnerships are allowed. Accepted partner requests override rating similarity unless impossible.

### 10.4 Match formation

Form groups of `teams_per_match`. Score candidate matches:

```text
match_cost =
  12 * average_rating_spread
  + 8 * repeat_opponent_count
  + 3 * repeated_judge_exposure_estimate
  + 2 * side_imbalance_after_assignment
```

Lower cost is better. For BP, compare both overall room spread and adjacent team strength; do not reduce four-team placement to a binary winner model.

### 10.5 Side/position assignment

Choose the assignment that minimizes each student's historical imbalance. PF/JWSD/WSDC/1v1 use `PROP`/`OPP`; BP uses `OG`/`OO`/`CG`/`CO`. Break equal scores deterministically with a seeded hash based on event ID and team ID so reruns with unchanged inputs give the same result.

### 10.6 Ironman handling

Ironman is an explicit manager-confirmed exception. Mark both the relevant team member and match. An ironman student must not receive duplicate speaker scores by accident; the ballot template defines how repeated speeches are attributed. The participation counts as one debate in history unless a distinct second participation was deliberately created.

### 10.7 Manual editing and regeneration

- Managers can always edit proposals before a match starts.
- Each manual change is audited.
- Regeneration must preserve locked/manual assignments unless the manager explicitly chooses to unlock them.
- Starting a match permanently locks its roster snapshot.
- After start, roster repair requires a dedicated audited emergency correction flow; never mutate snapshots casually.

### 10.8 Algorithm tests

Include fixture-based tests for all five formats, odd group sizes, accepted partners, equal ratings, format fallback, repeat opponents, side balancing, ironman, duplicate generation, and deterministic reruns.

---

## 11. Judge Assignment Logic

Candidate judges must be approved, available for the event, qualified for the format, checked in when live assignment occurs, and not already assigned to an overlapping match.

Rank valid candidates using:

```text
judge_cost =
  10 * total_times_judged_any_student_in_match
  + 6 * recent_times_judged_any_student_in_match
  + 3 * workload_count_for_event
```

Lower cost is better. In V1, only repeated judging is a requested conflict rule. Do not invent school/coach conflicts without product-owner confirmation, but design the function so additional conflict rules can be added later.

The recommendation UI shows qualification, repeated-student count, workload, and any warnings. Admin confirms the assignment. If a judge cancels, the same ranking generates replacements.

---

## 12. Notifications and Scheduled Work

Required email/in-app events:

- registration opened;
- registration closing soon;
- registration confirmed/cancelled;
- partner request and response;
- team/match/room assignment published or changed;
- event/debate reminder;
- judge availability approved and match assigned;
- missing check-in warning where appropriate;
- ballot overdue to judge and flagged to managers;
- ballot published;
- ballot review request resolved.

Use `email_jobs.dedupe_key` to prevent duplicate sends. Scheduled processing must tolerate retries. Email failures must not roll back the underlying business action; they are visible to managers and retryable.

No individual messaging feature is required. Notices target global, event, role, or format audiences.

---

## 13. UX Requirements

- Responsive desktop/mobile browser experience; no native app.
- Plain language and visible next actions for non-technical users.
- Semantic status labels with icons/text; never rely on color alone.
- All forms show inline validation and preserve entered data on recoverable failure.
- Destructive/cancelling actions require confirmation and describe consequences.
- Management tables support keyboard operation and do not require drag-and-drop; drag may be an enhancement with an accessible alternative.
- Pairing proposals show reasons and warnings, not just opaque scores.
- Live dashboard shows totals for registered, checked in, missing, judges ready, debates started, and ballots outstanding.
- Format operations use separate pages but consistent components.
- Ballot drafts autosave safely or expose a clear save-draft action; submission is explicit.
- Loading, empty, error, unauthorized, and success states are designed for every major page.

Accessibility target: WCAG 2.2 AA for keyboard navigation, labels, focus, contrast, error identification, and reduced motion.

---

## 14. Testing and Verification Expectations

No phase is complete solely because the UI renders.

### 14.1 Required automated checks

Every phase runs the relevant subset of:

```text
format check
lint
TypeScript typecheck
unit tests
integration/database tests
production build
Playwright end-to-end tests
```

Use the repository's package manager and scripts. CI must run deterministic checks on every pull request.

### 14.2 Unit tests

Cover:

- state-transition guards;
- date/deadline classification;
- format eligibility and preference validation;
- pairing/match/judge scoring and determinism;
- ballot template validation and score calculations;
- capability/permission helpers;
- notification deduplication.

### 14.3 Database and RLS tests

Use disposable/local Supabase where possible. Test migrations from a clean database and confirm:

- constraints reject invalid states;
- students cannot read another student's private history;
- students cannot read unpublished ballots or coach notes;
- judges cannot access unassigned matches/ballots;
- coaches cannot grant roles or publish ballots;
- managers cannot grant Super Admin or mutate audit logs;
- allowed reads/writes work for every role;
- audit entries are created for privileged mutations;
- concurrent duplicate registration/check-in/start/submit/publish calls remain consistent.

### 14.4 End-to-end acceptance journeys

At minimum:

1. Super Admin provisions roles and format qualifications.
2. Manager creates an event, enables formats, and opens registration.
3. Student registers, selects preferences, requests a partner, cancels/re-registers within allowed rules, and checks in.
4. Manager generates and edits teams/matches, assigns a judge, and publishes assignments.
5. Judge signs up, is approved, checks assignment, starts debate, saves draft, and submits valid ballot.
6. Manager sees live status, reopens/resolves a ballot correction, and publishes.
7. Student sees only the published ballot and submits a review request.
8. Coach sees history/ballot and creates a private note that the student cannot access.
9. Missing check-in, late cancellation, ironman, judge replacement, overdue start, and overdue ballot scenarios.

### 14.5 Manual verification

For each phase, include a short manual checklist with URLs, test accounts/roles, expected results, and any seeded data. Verify responsive layouts at representative mobile and desktop sizes and test keyboard-only operation for new workflows. From Phase 0 onward, also keep a repeatable mainland-China smoke test for the public page, login, one authenticated read/write, static assets, and email. Run the full cross-border matrix before release and after any hosting, DNS, CDN, authentication, email, or major frontend dependency change.

### 14.6 Completion report

At the end of each phase DeepSeek reports:

- what changed;
- files/migrations added;
- decisions or deviations;
- commands/checks run and their results;
- manual verification steps;
- known limitations;
- whether documentation and `AGENTS.md` remain accurate;
- the single next owner action in the beginner format defined in Section 0.2.

DeepSeek must not claim tests passed if they were not run or if the environment prevented them.

---

## 15. Build Phases

Each phase ends with tests, documentation, a reviewable checkpoint, and a stop for approval.

### Phase 0 — Discovery and architecture (no feature implementation)

- Inspect the repository and tooling.
- Create `AGENTS.md` from Appendix A.
- Create `OWNER_GUIDE.md` and `NEXT_STEP.md` for the non-technical owner.
- Produce `docs/architecture.md`, `docs/schema.md`, `docs/permissions.md`, `docs/testing.md`, `docs/deployment-regions.md`, and `docs/decisions/` ADRs.
- Create a traceability table mapping V1 requirements to planned phases/tests.
- Identify ambiguities, risks, and deployment prerequisites.
- Propose exact package versions and source layout.
- Define migration order, RLS strategy, test strategy, and local setup.
- Compare Alibaba Cloud and Tencent Cloud offerings in the explicit Hong Kong and Singapore regions using current official information, showing the owner a simple recommendation, expected monthly cost, payment commitment, and operational burden.
- Deploy only a minimal, disposable proof page/authentication/API test after obtaining owner approval for any cost.
- Guide the owner through mainland-China tests and record the results. Do not select the production architecture until critical flows pass.
- Decide whether managed Supabase Singapore is reliable enough or whether a same-region/self-hosted alternative is required.
- Do not scaffold the production application or write migrations unless the product owner explicitly approves moving into Phase 1. The only Phase 0 code exception is the smallest disposable page/auth/API/email proof needed for the approved connectivity test; keep it isolated from production implementation.

### Phase 1 — Foundation, auth, profiles, roles, and schema core

- Scaffold/configure the Next.js TypeScript application if not already present.
- Add Tailwind/shadcn and baseline accessible layout.
- Configure the approved database/authentication clients correctly for browser/server/middleware boundaries.
- Add the approved Docker production build and a non-production deployment to the selected Hong Kong/Singapore environment.
- Ensure runtime pages use no unapproved third-party browser assets and pass the basic mainland-China smoke test.
- Create initial migrations for identity, roles, formats, qualifications, events, registrations, and audit foundation.
- Seed five debate formats.
- Implement signup/login/logout/password reset and protected routing.
- Create role-aware dashboard shell.
- Implement initial RLS and automated permission tests.
- Add CI quality checks and `.env.example`.
- No event-management UI beyond what is necessary to verify foundation.

### Phase 2 — Admin users, formats, and events

- User status and role management for Super Admin.
- Judge approval/qualification management.
- Event create/edit/clone, event formats, lifecycle transitions.
- Notice management and event listing.
- Audit all privileged mutations.

### Phase 3 — Student registration and preferences

- Student event discovery, registration, format preferences, partner requests.
- Deadline-aware cancellation and late-cancellation/no-show tracking.
- Eligibility enforcement and confirmation notifications.
- Manager registration view and manual corrections.

### Phase 4 — Pairing and participation proposals

- Participation allocation with entitlement types.
- Deterministic team proposal engine for all five formats.
- Explanations, warnings, accepted partner handling, incomplete team handling.
- Manager review/edit/lock/confirm workflow.

### Phase 5 — Matches, rooms, sides, and judge assignments

- Match proposal and side-balancing logic.
- Separate format operations pages.
- Rooms/meeting links and assignment publication.
- Judge availability, approval, recommendation, confirmation, replacement.

### Phase 6 — Check-in and live dashboard

- Student/admin check-in and judge readiness.
- Live status calculations, warning/critical timing, counts, overdue start.
- Start Debate transaction and roster snapshots.
- Accessible manual move/ironman/emergency workflows before start.

### Phase 7 — Ballots

- Versioned templates for PF, JWSD, WSDC, BP, and 1v1.
- Draft save, format validation, submission, manager review.
- Reopen/resubmit/audit and publish workflow.
- Overdue ballot email/flags.

### Phase 8 — History, coach tools, and reviews

- Student debate history and published ballot archive.
- Coach student history and private notes.
- Ballot review request and manager resolution.
- Judge history and profile/paradigm experience.

### Phase 9 — Notifications and operational hardening

- Complete email job processing and templates.
- In-app notification center.
- Retry/observability, rate limits, audit coverage review.
- Accessibility, performance, responsive, and security pass.

### Phase 10 — Release readiness

- Full end-to-end regression suite.
- Clean-database migration rehearsal and seed procedure.
- Selected Hong Kong/Singapore provider deployment documentation, data-location inventory, cost estimate, renewal instructions, and owner-friendly operations guide.
- Full mainland-China test matrix on at least two practical networks, with no VPN and with results stored in `docs/deployment-regions.md`.
- Verification of email delivery to selected Chinese mailbox providers.
- Backup/restore and incident runbooks.
- Production smoke test plan, launch checklist, rollback plan.
- Known limitations and V2 backlog.

---

## 16. Definition of Done

A phase is done only when:

- agreed acceptance criteria are implemented;
- migrations apply from a clean database;
- RLS and server authorization cover new data/actions;
- automated tests include happy, error, forbidden, and edge cases;
- lint, typecheck, relevant tests, and build pass;
- manual verification is documented;
- accessibility basics are verified;
- audit and notification behavior is included where relevant;
- no secrets or personal data appear in source/logs/fixtures;
- relevant docs and requirement traceability are updated;
- DeepSeek provides a concise completion report, updates `OWNER_GUIDE.md` and `NEXT_STEP.md`, and stops for approval.

---

## 17. Open Decisions DeepSeek Must Not Invent

Phase 0 should surface these for confirmation, while choosing reversible placeholders only where needed for planning:

- exact registration opening/closing offsets and reminder schedule;
- exact ballot fields, score ranges, totals, and winner/placement rules for each format;
- whether a Club Manager may edit presentation-only ballot text or must always reopen to the judge;
- exact coach permission for changing ratings/eligibility versus view-only access;
- rules for emergency roster correction after a match has started;
- whether students may withdraw/reopen a ballot review request;
- retention/deletion policy for personal data and inactive accounts;
- production email sender domain and branding;
- whether judges have a separate explicit check-in action or availability approval counts as readiness;
- whether event assignments become visible immediately on confirmation or through a separate publish action.
- final cloud provider and region: Alibaba Cloud or Tencent Cloud; Hong Kong or Singapore;
- whether the managed Supabase Singapore proof is acceptable or a same-region/self-hosted alternative is required;
- production domain registrar/DNS provider and email provider;
- acceptable monthly budget and whether any annual commitment is allowed;
- the organization/entity that will own the domain and cloud accounts;
- the qualified privacy/legal review outcome for student/minor and cross-border data.

These do not justify silently broadening Phase 1.

---

## Appendix A — Required `AGENTS.md`

DeepSeek must create `/AGENTS.md` at the repository root with the following content, adapting only package-manager command names after inspecting the repository. Any adaptation must preserve the rules.

```markdown
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
```

---

## Appendix B — Starter Prompt for Phase 0

Copy this prompt into DeepSeek after placing this master specification at the repository root:

```text
You are beginning Phase 0 for the INSPIRA Debate Club Management System.

First, read `INSPIRA_DEEPSEEK_MASTER_SPEC.md` in full. Then inspect the entire repository, including the package manager, configuration, scripts, existing application code, migrations, tests, git status, and any current instruction files. Do not modify or revert unrelated user work.

I am the product owner and I have little or no coding, terminal, Git, database, DNS, cloud-server, or deployment knowledge. Communicate with me in plain Chinese. Follow the beginner interaction contract in Section 0.2 exactly. Do not give me a large batch of unexplained tasks. Guide me through one safe checkpoint at a time and wait for my confirmation.

Create a root-level `AGENTS.md` using Appendix A of the master specification. Read it and obey it for the rest of this task.

This phase is discovery and architecture only. Do not scaffold the production app, create production migrations, or implement product features unless I separately approve that scope. You may create the smallest isolated, disposable page/auth/API/email proof needed for the approved Hong Kong/Singapore connectivity test, but explain it first and obtain my approval before any purchase or recurring charge.

Produce:

1. `docs/architecture.md` — proposed application architecture, source layout, server/client boundaries, approved database/auth client patterns, environment variables, email approach, error handling, observability, and deployment shape.
2. `docs/schema.md` — complete schema review, migration ordering, constraints, indexes, transactions, historical snapshots, and any recommended corrections to the master spec.
3. `docs/permissions.md` — role/capability matrix translated into an RLS policy plan, including helper functions and explicit allow/deny tests.
4. `docs/testing.md` — unit, integration, database authorization/RLS, Playwright, CI, fixtures, mainland-China connectivity, and manual verification strategy.
5. `docs/requirements-traceability.md` — every V1 requirement mapped to a build phase and at least one planned verification method.
6. `docs/decisions/` — concise ADRs for major choices such as auth/profile identity, migrations/data access, ballot templates, background email processing, pairing determinism, and roster snapshots.
7. `OWNER_GUIDE.md` and `NEXT_STEP.md` written for a complete beginner.
8. `docs/deployment-regions.md` comparing Alibaba Cloud and Tencent Cloud in explicit Hong Kong and Singapore regions, including current official source links, estimated monthly cost, data locations, responsibilities, and the test plan.
9. A Phase 1 implementation plan broken into small reviewable steps with exact acceptance criteria.

Before selecting production infrastructure, guide me through a minimal proof page plus authentication/API/email connectivity test. Hong Kong is the first benchmark candidate; Singapore is the second candidate. Obtain my explicit approval before creating any paid resource. Do not assume that an overseas server is automatically accessible from mainland China. Record tests from normal mainland networks without a VPN. If managed Supabase Singapore is unreliable for a critical flow, stop and explain the self-hosted versus same-region managed alternatives in beginner language before asking me to choose.

Before writing, identify contradictions, missing decisions, security/privacy risks, and assumptions. Put decisions requiring my input in a clearly labeled section; do not silently decide them. You may recommend a default and explain its impact.

At the end, run any documentation/link checks already available, review the diff, and provide a completion report in the exact format required by `AGENTS.md`. Stop after Phase 0 and wait for my approval before Phase 1.
```

---

## Appendix C — Starter Prompt for Phase 1

Use this only after reviewing and approving Phase 0:

```text
Proceed with Phase 1 of the INSPIRA Debate Club Management System.

Read `AGENTS.md`, `INSPIRA_DEEPSEEK_MASTER_SPEC.md`, all Phase 0 documents, the approved ADRs, and `docs/requirements-traceability.md`. Inspect the current repository and git status before changing anything. Preserve unrelated work.

I am a complete beginner. Speak to me in plain Chinese and follow the beginner interaction contract. If I must create an account, buy a resource, change DNS, add a secret, or run a command, give exact instructions and wait for confirmation. Never ask me to paste a secret into chat.

Phase 1 scope is limited to foundation, authentication, profiles, multi-role authorization, core schema, and automated security tests. Do not begin event-management, registration, pairing, live operations, or ballot feature UI.

Implement the approved Phase 1 plan, including:

- Next.js App Router with strict TypeScript and the approved package versions;
- Tailwind/shadcn baseline and an accessible responsive application shell;
- correct browser/server/middleware boundaries for the database/authentication design approved in Phase 0;
- email/password signup, login, logout, password reset, session refresh, and protected routes;
- migrations for profiles, multi-role `user_roles`, student/judge profiles, formats, student format eligibility/ratings, judge qualifications, events/event formats, registrations/preferences, and the audit foundation, exactly as approved in Phase 0;
- seed data for PF, JWSD, WSDC, BP, and ONE_V_ONE;
- role-aware dashboard routing with safe unauthorized behavior;
- default-deny RLS policies and server-side capability checks for the Phase 1 schema;
- typed validation and generated database types;
- `.env.example`, local setup instructions, migration/seed commands, and CI checks;
- the approved Docker production build and a safe non-production deployment in the selected Hong Kong/Singapore region;
- no unapproved third-party runtime browser assets, plus the basic mainland-China smoke test;
- unit/integration/database-authorization tests proving allowed and forbidden behavior for student, judge, coach, club_manager, and super_admin.

Use migrations only; do not make undocumented dashboard schema changes. Do not expose privileged database/authentication keys. Do not use mock client-side role checks as authorization. Use fictional test identities and no real personal data.

Work in small coherent steps and run focused checks as you go. Before completion, run formatting, lint, TypeScript typecheck, all Phase 1 unit/integration/RLS tests, and a production build. If Playwright smoke coverage is part of the approved Phase 0 plan, run it too.

Update the architecture, schema, permissions, testing, and traceability documents to match the implementation. Review the final diff for scope, security, accidental secrets, generated files, and accessibility.

Provide the `AGENTS.md` completion report with exact commands and results, remaining limitations, and manual verification steps. Stop after Phase 1 and wait for my approval before Phase 2.
```

---

## Appendix D — Recommended Phase Completion Prompt

Use this at the end of any later phase if DeepSeek has not already followed the reporting rule:

```text
Review the active phase against `AGENTS.md`, the master specification, approved ADRs, and requirements traceability. Inspect the full diff. Run every required check you can run locally and report the exact result; do not claim unrun checks passed. Update all affected documentation and traceability. Then provide the required completion report, identify any deviations or risks, and stop without beginning the next phase.
```

---

## Appendix E — V2 Backlog

Keep these out of V1 unless separately approved:

- parent accounts and family linking;
- integrated payments, credits, invoices, and reconciliation;
- WeChat/enterprise WeChat/SMS notifications;
- coach-to-student ownership and format-specific coach assignments;
- skills taxonomy, longitudinal coaching analytics, and feedback themes;
- formal conflict-of-interest rules for schools/coaches;
- multi-campus and hybrid/physical venue support;
- judge panels and advanced tabulation;
- AI pairing explanations or feedback analysis;
- native mobile applications;
- internal direct messaging;
- data warehouse/reporting exports beyond basic operational reports.

---

## Appendix F — Infrastructure Sources to Recheck During Phase 0

Cloud products, regions, prices, and regulations change. DeepSeek must recheck current official documentation during Phase 0 and record the access date. The following sources support the present planning assumptions:

- [Tencent Cloud global infrastructure](https://intl.cloud.tencent.com/global-infrastructure?lang=en) — lists Hong Kong and Singapore regions.
- [Alibaba Cloud global locations](https://www.alibabacloud.com/en/global-locations) — lists China (Hong Kong) and Singapore regions.
- [Supabase available regions](https://supabase.com/docs/guides/platform/regions) — lists a specific Southeast Asia (Singapore) managed region.
- [Supabase self-hosting responsibilities](https://supabase.com/docs/guides/self-hosting) — explains that the operator is responsible for server maintenance, security, database maintenance, backups, recovery, monitoring, and uptime.
- [Alibaba Cloud server/ICP usage notes](https://www.alibabacloud.com/help/en/simple-application-server/product-overview/usage-notes) — distinguishes mainland-China hosting, which requires ICP filing, from servers outside mainland China.
- [PRC Ministry of Industry and Information Technology filing rules](https://www.miit.gov.cn/gyhxxhb/jgsj/cyzcyfgs/bmgz/xxtxl/art/2024/art_84a0cfa0ebd049bbbe751dca9a008e56.html) — official rules for non-commercial internet information services provided within mainland China.

These links are technical planning references, not legal advice or evidence that the finished service is compliant or continuously reachable.

---

**End of master specification.**
