# Decisions

The choices that shape this project, with the reasons and what was turned down. Each entry says what to revisit if the situation changes. Newest decisions are at the bottom. For the full model see [architecture.md](architecture.md).

## 1. Serverless on AWS, defined in CDK
**Decision.** API Gateway, Lambda (Python 3.12), DynamoDB, Cognito, S3 and CloudFront, all defined with AWS CDK in TypeScript.
**Why.** CIC needs something that costs almost nothing when idle, needs no servers to patch, and can be rebuilt from the repo. The budget was under $20 a month. Every resource is code, so a new person can deploy the whole system with `cdk deploy`.
**Turned down.** EC2 or containers (always-on cost, patching), RDS (a server to run for a small workload).
**Revisit when** traffic is steady and large enough that a database with joins would be simpler than DynamoDB key design.

## 2. Four DynamoDB tables
**Decision.** `content` (modules), `core` (schools, classes, rosters, users, keys, sessions), `progress` (activity state, assessments, submissions) and `events` (audit and hint logs).
**Why.** The tables have different shapes of traffic and different lifetimes. Progress is written constantly by students. Events expire on their own (TTL). Content is read much more than it is written. Keeping them apart keeps each access pattern simple. Key shapes are in architecture.md section 6.
**Consequence.** Cross-table reports (cohort summaries) are computed in code, not by a query.

## 3. Staff sign in with Cognito, invite-only, MFA required
**Decision.** No self sign-up. An admin invites each person. TOTP MFA is required. Roles are Cognito groups: `cic_admin`, `instructor`, `external_teacher`, `reviewer`.
**Why.** Teachers handle student records, so a stolen password must not be enough. Cognito does MFA, password rules and invite email without code we have to maintain.
**Consequence.** Cognito applies MFA to the whole pool, not per group. Roles take effect at the person's next token refresh (within an hour).
**Where checked.** The API's JWT check proves who the caller is. Each Lambda then checks the role itself (`cic.authz`). The browser hiding a button is never the control.

## 4. Students have no account: class code plus three secret words
**Decision.** A student signs in with the class code and their own three words (for example `maple-tiger-blue`). The words are stored as an HMAC with a pepper kept in Secrets Manager. Failures are limited per class, and a teacher can reset a student's words.
**Why.** Students are often young, have no school email, and share devices. A per-student secret means one student cannot open another's work, which a shared class link would allow.
**Turned down.** A link or QR code only (anyone with the link is any student). "Pick your name from the roster" (shows every classmate's name to anyone with the class code).

## 5. Students are identified by an ID, not a name
**Decision.** Each student has a random UUID. The name is for display only. A per-class roster number and an optional school-issued ID help teachers tell students apart. Extra columns in an uploaded roster file are ignored and never stored.
**Why.** Real classes have two students with the same name, and names change. Using names as keys would merge or lose data.

## 6. Collect as little student data as possible
**Decision.** Name, school and class. Nothing else about a student. No email, birthdate or address. Student names are never sent to the AI model, and are not written to logs.
**Why.** The less we hold, the less can leak, and the easier it is for a school to say yes.

## 7. Curriculum authoring is a permission, not a role
**Decision.** Authors are CIC admins and instructors an admin has flagged `canAuthor`. An author can see and edit every module CIC has made, drafts included. Deleting stays with admins and the module's creator. Publishing creates an immutable version, and a class keeps the version it was given until its teacher moves it.
**Why.** CIC instructors are part of the organization, so one author's module should be fixable by another. Immutable versions mean a lesson never changes under a student part-way through it.
**Turned down.** Every instructor can create modules (too easy to change shared content by accident).

## 8. Teachers outside CIC are a separate kind of user
**Decision.** An external teacher belongs to an *external* school and runs their own classes on CIC's curriculum with their own roster. CIC admins are refused on those classes (roster, progress, exports) and see only counts in the usage report. Those classes are kept out of admin class lists, student search, cohorts and the read API.
**Why.** The partner schools own their students' data. CIC needs to know the curriculum is used, not who the students are.
**Sign-up.** Self-serve, with approval. A public form creates a request, an admin approves it, and only then is an invite sent. The staff user pool stays invite-only. Turned down: turning on Cognito's own sign-up for the staff pool.

## 9. AI hints are Socratic, and the server checks every reply
**Decision.** Amazon Nova Lite through Bedrock gives a short hint that points without answering. The model is given the answers only as a "do not say" list. Every reply is checked on the server (no answer, no "the answer is", no spelled-out letters, little code) and replaced with a generic hint if it fails. Hints work on checks, worksheets and coding exercises, never on tests. Each student gets 10 a day and the whole app has a monthly cap (5000).
**Why.** A model is not a safe place to enforce "never give the answer", so the rule is enforced in our code. Hints on a pretest or post-test would spoil the measurement of learning. Caps keep the bill predictable.
**Turned down.** A general chatbot on the lesson page.

## 10. Student code runs in the student's browser
**Decision.** Python runs with Pyodide in a Web Worker on the student's device. The browser runs the tests and reports the result. The server stores the code and a score computed from the module's own test list, marked `selfReported`. The server never executes student code.
**Why.** Running arbitrary student code on our servers is a security risk, needs a sandbox and costs money. In the browser it is sandboxed by WebAssembly and costs nothing.
**Consequence.** A student could fake a pass, and tests are visible to students. So exercises are practice, never a replacement for the pretest and post-test, and teachers can read the submitted code. Submitting always finishes the step, so no student gets stuck.
**Turned down.** A server-side sandbox (a project of its own). Revisit if CIC needs graded code assignments.

## 11. Learning is measured with paired pretest and post-test questions
**Decision.** Each module has a pretest and a post-test over the same concepts, paired question by question. Gain and mastery are computed per student, class and concept. The read API suppresses any group with fewer than 5 students.
**Why.** "Who finished" does not show what was learned. Pairing makes gain fair, and the small-group rule stops a number from pointing at one child.

## 12. Static frontend, published as a zip to Amplify
**Decision.** Next.js builds a static site. Amplify hosts it. Publishing is a zip upload.
**Why.** A static site has nothing to patch and costs very little. A manual upload needs no Git connection or build service during a hackathon.
**Consequence.** Publishing is a manual step (documented in operations.md). Connecting Amplify to GitHub would automate it.

## 13. A read-only API with keys for CIC's own dashboard
**Decision.** CIC's dashboard reads aggregated cohort results through an API protected by keys. A key is shown once and only its SHA-256 hash is stored. Keys have scopes, can be revoked, and key changes are audited.
**Why.** CIC wants its own dashboard without staff accounts. Aggregates only means no student names or IDs leave the system.

## 14. The whole interface also runs on fake data
**Decision.** With `NEXT_PUBLIC_USE_MOCKS=true`, Mock Service Worker answers every API call with sample data.
**Why.** Frontend work and demos do not wait on the backend, and anyone can run the app with no AWS account.
**Rule.** A production build must have mocks off, or the site would show sample data.

## 15. How the team works
**Decision.** Every change is a small pull request into `main`. No stacked pull requests, and no PR based on another feature branch.
**Why.** Early on, several PRs were merged into their parent branches and never reached `main`, so parts of the API were missing from the default branch until they were restored. Small PRs into `main` keep the history readable and the default branch complete. See [AGENTS.md](../AGENTS.md).
