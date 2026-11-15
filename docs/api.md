# REST API: Curriculum & Student Progress Platform

Status: design draft. See [architecture.md](architecture.md) for the model and rules behind these endpoints.

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/v1`

## Conventions

**Auth schemes**

| Scheme | Header | Used by | Verified by |
|---|---|---|---|
| Public | none | `/auth/*`, `/health` | Throttled at the gateway |
| Staff | `Authorization: Bearer <Cognito token>` | `/me`, `/admin`, `/curriculum`, `/classes` | Cognito JWT authorizer, then role and membership checks in the Lambda |
| Student | `Authorization: Bearer <session token>` | `/student/*` | `authorizer-student` Lambda |
| Key | `X-Api-Key: cic_<keyId>_<secret>` | `/read/*` | `authorizer-apikey` Lambda |

**Roles in tables below:** `A` = cic_admin, `I` = instructor (member of that class), `X` = external teacher (member of that class), `R` = reviewer, `S` = student, `Au` = staff user with the `canAuthor` flag.

**Response envelope**

```json
{ "data": { }, "meta": { "nextCursor": null } }
```

**Errors** (same shape for every Lambda, including 4xx and 5xx):

```json
{ "error": "Human readable message", "code": "MACHINE_CODE", "requestId": "..." }
```

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_CSV` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `MODULE_LOCKED`, `ACTIVITY_LOCKED`, `ASSESSMENT_ALREADY_SUBMITTED` |
| 404 | `NOT_FOUND` |
| 409 | `REVISION_CONFLICT`, `DUPLICATE_SUBMISSION`, `ALREADY_PUBLISHED`, `TOO_EARLY` |
| 429 | `LOGIN_THROTTLED` (with `Retry-After`), `RATE_LIMITED`, `HINT_LIMIT_REACHED`, `AI_QUOTA_EXCEEDED` |
| 503 | `HINTS_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` (generic message, details only in logs) |

**Other rules:** JSON only, UTF-8, request bodies capped at 256 KB. Lists take `limit` (default 50, max 200) and `cursor`. Timestamps are ISO 8601 UTC. IDs are opaque strings. `studentId` is a UUID v4 (examples below are shortened). All routes answer `OPTIONS` with CORS headers for the allowlisted origins.

---

## 1. Auth and identity

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/student/login` | Public | Class code + student secret words, returns a session |
| POST | `/auth/student/logout` | Student | Delete the session |
| GET | `/me` | Staff | Role, display name, `permissions: {canAuthor}`, class memberships |
| GET | `/health` | Public | Liveness |

`POST /auth/student/login`

```json
// request
{ "classCode": "K7M4QX", "studentCode": "maple-tiger-blue" }
// 200
{ "data": { "sessionToken": "ses_...", "expiresAt": "2026-11-15T20:00:00Z",
            "student": { "displayName": "Ana R.", "classId": "cls_01" } } }
```

- A wrong class code and wrong words return the same 401 `INVALID_CREDENTIALS`, with uniform timing.
- After 10 failures in 5 minutes for a class code, that class returns 429 `LOGIN_THROTTLED` with `Retry-After` for 5 minutes.
- The convenience link `https://<app>/s#<classCode>.<words>` is read by the frontend and posted to this same endpoint.

---

## 2. Admin: users, organizations, cohorts, API keys

All `A` only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users` | List staff users |
| POST | `/admin/users` | Invite a user `{email, name, role: instructor\|external_teacher\|reviewer\|cic_admin, canAuthor?, orgId?}` (Cognito admin-create-user). `external_teacher` needs an `orgId` of an external school. Everyone else must be in a CIC school. |
| PATCH | `/admin/users/{userId}` | Change role, set `canAuthor`, or disable |
| GET, POST | `/admin/orgs` | List or create schools `{name, kind?: cic\|external}`. `kind` defaults to `cic` and cannot be changed later. An `external` school belongs to an external teacher. CIC sees its usage only. |
| GET | `/admin/usage` | How much external teachers use CIC's curriculum. Counts and dates only, see below. |
| PATCH | `/admin/orgs/{orgId}` | Rename or archive |
| GET, POST | `/admin/cohorts` | List or create cohorts `{name, orgId?}` |
| PATCH | `/admin/cohorts/{cohortId}` | Rename, archive, or set its classes `{name?, status?, classIds?}`. `classIds` is the full list: classes missing from it are removed, and a class listed here moves out of any other cohort. |
| GET | `/admin/api-keys` | List keys (label, scopes, lastUsedAt, revoked). Never the secret. |
| POST | `/admin/api-keys` | Create `{label, scopes: ["read:cohorts"]}`. The full key is in this response only. |
| DELETE | `/admin/api-keys/{keyId}` | Revoke |
| GET | `/admin/audit?from=&to=&limit=` | Audit entries, newest first: API key created or revoked, and class exports. Dates look like `2026-11-15`; the default range is the last 30 days and the most is 366. `limit` is 1 to 200 (default 50). |

---

## 3. Curriculum: authoring and review

| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/curriculum/modules` | A, I, R | List modules. A and Au can pass `status=draft\|published\|all`. Others get published only. |
| POST | `/curriculum/modules` | A, Au | Create a draft `{title, template: "standard"}` (the template seeds the pre, video, check, worksheet, exit, post structure) |
| GET | `/curriculum/modules/{moduleId}` | A, I, R | Latest published module. Instructors use this to browse modules before assigning them. A and Au can pass `?draft=true`. Includes answer keys (staff only). |
| PUT | `/curriculum/modules/{moduleId}/draft` | A, Au | Save the whole draft. Requires `If-Match: <revision>`. 409 `REVISION_CONFLICT` if stale. |
| POST | `/curriculum/modules/{moduleId}/publish` | A, Au | Validate and create the next immutable version |
| GET | `/curriculum/modules/{moduleId}/versions` | A, Au | Version list with publish dates |
| GET | `/curriculum/modules/{moduleId}/versions/{version}` | A, I, R | A specific version |
| GET | `/curriculum/concepts` | A, I, R | Concept tags in use (for the tag picker and reports) |
| POST | `/curriculum/assets/upload-url` | A, Au | Presigned S3 PUT for an image `{contentType, size}`. PNG, JPEG, or WebP, max 5 MB. |

**Who can write.** Only curriculum authors: CIC admins, and instructors an admin has made authors (`canAuthor`). An author sees and can update **every** module CIC has made, drafts included, not only their own. Instructors who are not authors, external teachers and reviewers can browse and assign published modules but get 403 on every write. If they ask `GET /curriculum/modules?status=draft` or `all`, they still get the published list (no error). Deleting a module is for admins and the author who created it.

**Publish validation** (400 `VALIDATION_ERROR` with a list of problems): at least one pretest and one post-test; every assessment question has a `concept`, an answer key, and points; pre and post cover the same concepts; video IDs match the allowlist; no empty prompts.

`PUT .../draft` body is the module document shown in architecture.md section 6.

**Reviewer preview.** Reviewers use `GET /curriculum/modules/{id}` and render it in a read-only preview. No progress or submission endpoint is reachable with a reviewer token.

---

## 4. Classes, roster, assignments

`I` and `X` mean the caller must be a member of that class. `A` can access every CIC class. An external teacher's class belongs to their school, so `A` gets 403 on every route that takes its `classId` (class, roster, progress, export, assignments), and external classes do not appear in `A`'s class lists, student search, cohorts, or read API.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/classes` | I, X, A | Create `{name, orgId, cohortId?, termStart?, termEnd?}`. The creator becomes a member. |
| GET | `/classes` | I, X, A | My classes. A can pass `orgId`, `cohortId`. |
| GET | `/classes/{classId}` | I, A | Class detail, assignments, counts |
| PATCH | `/classes/{classId}` | I, A | Rename, settings (stuck thresholds), `currentModuleId` (where late joiners start by default), archive |
| POST | `/classes/{classId}/members` | A | Add an instructor `{userId}` |
| GET | `/classes/{classId}/roster?q=&status=` | I, A | Roster with `rosterNumber`, `externalId` (if any), status. `q` is a case-insensitive name search. |
| GET | `/classes/{classId}/roster/duplicates` | I, A | Groups of students in the class with the same display name, for review |
| GET | `/students?q=&cohortId=&classId=` | I, A | Search students by name, filtered by cohort and class. Instructors only see classes they belong to. Each result has `studentId`, `displayName`, `rosterNumber`, `classId`. |
| GET | `/students/{studentId}` | I, A | Student detail by ID (authorization checked against the student's class) |
| POST | `/classes/{classId}/roster/import?dryRun=true` | I, A | Preview a CSV import. No writes. |
| POST | `/classes/{classId}/roster/import` | I, A | Commit the import |
| POST | `/classes/{classId}/roster` | I, A | Add one student `{displayName, externalId?, startModuleId?}` (late joiner). `startModuleId` defaults to the class's `currentModuleId`. Returns that student's credential once. It cannot be shown again; use `/credentials` to reissue. A repeated name is created as a new student and returned with `possibleDuplicateOf`. |
| PATCH | `/classes/{classId}/roster/{studentId}` | I, A | Rename or deactivate (deactivate is how a duplicate is retired for the demo) |
| POST | `/classes/{classId}/roster/{studentId}/merge` | I, A | Merge this duplicate into `{intoStudentId}` (same class) and remove it. Activities keep the better result (complete wins, highest score, attempts and time add up). Pretest and post-test keep the earlier submission, so gain is not inflated. Submissions and unlock overrides move over. The kept student's name and login words do not change. Safe to retry. |
| DELETE | `/classes/{classId}/roster/{studentId}` | A | Delete a student and their progress |
| POST | `/classes/{classId}/credentials` | I, A | Generate or reset credentials `{studentIds?}` (all if omitted). Old words stop working and those students' sessions are revoked. The words are returned in this response only. |
| POST | `/classes/{classId}/join-code/rotate` | I, A | Issue a new class code |
| POST | `/classes/{classId}/assignments` | I, A | Assign a module `{moduleId, order?, targetDate?}` pinned to the latest published version |
| GET | `/classes/{classId}/assignments` | I, A | List with version and start counts |
| PATCH | `/classes/{classId}/assignments/{moduleId}` | I, A | Body `{order?, targetDate?, moduleVersion?}`. `targetDate: null` clears it. `moduleVersion` must be newer than the current one and already published. It moves only if nobody started the module, unless the caller is an administrator. |
| DELETE | `/classes/{classId}/assignments/{moduleId}` | I, A | Unassign |
| POST | `/classes/{classId}/students/{studentId}/unlock` | I, A | Override: unlock `{moduleId}` for this student |

`POST .../roster/import` body (CSV is sent as text, not as a file upload):

```json
{ "csv": "displayName,externalId\nAna R.,1042\nBen T.,1043\n", "duplicateNames": "create", "startModuleId": "py-loops" }
```

- `displayName` is required. `externalId` is optional. Any other column is **ignored, never stored or logged**, and listed in the dry-run response as `ignoredColumns`. The frontend should also strip extra columns in the browser before sending, so unneeded data (a birthdate column in a school export, for example) never leaves the instructor's machine.
- `startModuleId` (optional) sets the start module for newly created students. It defaults to the class's `currentModuleId`.
- **Matching.** A row with an `externalId` that already exists in the class updates that student (no new credential is created). A row without a match is added as a new student.
- **Repeated names.** Names are not unique. By default a repeated name is created as a new student and flagged as a possible duplicate. Set `duplicateNames` to `"skip"` to ignore rows whose name already exists, which is useful when re-importing a file that has no `externalId` column.
- Limits: 500 rows, 100 characters per name.
- Row numbers count data rows from 1: the header is not a row and blank lines are skipped.
- The commit imports every valid row, skips rows with problems, and returns `{created, updated, skipped, possibleDuplicates, errors, ignoredColumns, credentialsNeeded}`. Imported students have no login words yet: call `POST /classes/{classId}/credentials` to issue them.
- `GET /students` returns up to `limit` matches (default 50). `meta.truncated` is true when more exist.

The dry run (`?dryRun=true`) writes nothing and returns:

```json
{ "data": { "toCreate": 26, "toUpdate": 2, "ignoredColumns": ["dob"],
            "possibleDuplicates": [ { "row": 7, "displayName": "Alex Kim", "matchesStudentId": "stu_03" } ],
            "errors": [ { "row": 12, "reason": "displayName is empty" } ] } }
```

`POST .../credentials` response (the login sheet):

```json
{ "data": { "classCode": "K7M4QX", "loginUrlBase": "https://<app>/s",
  "students": [
    { "studentId": "stu_01", "displayName": "Ana R.", "studentCode": "maple-tiger-blue" },
    { "studentId": "stu_02", "displayName": "Ben T.", "studentCode": "river-lemon-ten" } ] } }
```

---

**External teachers.** `POST /classes` by an external teacher creates the class in their own school (`ownerKind: "external"`). It cannot take a `cohortId`. An admin cannot create a class in an external school, add members to an external class, or put one in a cohort. Instructors and external teachers use the same student login. `GET /classes` returns `ownerKind` (`cic` or `external`) for each class.

### `GET /admin/usage`
`A` only. What CIC can see about external teachers, and all of it. No student names, IDs, scores, codes or per-student rows.
```json
{"generatedAt": "...", "activeWindowDays": 7,
 "totals": {"schools": 1, "classes": 2, "students": 48, "studentsActiveLast7Days": 31},
 "schools": [{"orgId": "...", "name": "Desert Prep", "status": "active", "teachers": ["Pat Lee"], "classes": 2, "students": 48,
              "studentsActiveLast7Days": 31, "lastActivityAt": "2026-11-14T17:02:11Z",
              "classList": [{"name": "Intro CS", "status": "active", "createdAt": "...", "teachers": ["Pat Lee"], "students": 24,
                             "modulesAssigned": 3, "studentsActiveLast7Days": 17, "lastActivityAt": "..."}]}]}
```
`students` counts active roster entries. A student is active when they did anything in the last 7 days.

## 5. Instructor dashboards and reports

Roles `I` (member) and `A` unless noted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/classes/{classId}/progress` | Roster by assigned modules matrix: status, percent, active minutes |
| GET | `/classes/{classId}/students/{studentId}/progress` | One student's activity detail, scores, time on task |
| GET | `/classes/{classId}/attention` | `{notStarted: [...], stuck: [...]}` with the reason for each |
| GET | `/classes/{classId}/modules/{moduleId}/gain` | Pre, post, gain per student, plus class summary and by-concept breakdown |
| GET | `/classes/{classId}/concepts` | Gain and mastery per concept across modules |
| GET | `/classes/{classId}/review-queue` | Worksheet submissions waiting for review |
| PUT | `/classes/{classId}/submissions/{submissionId}/review` | `{score, comment}` and mark reviewed |
| GET | `/classes/{classId}/export?type=gain\|progress` | CSV download (formula-safe) |
| GET | `/admin/cohorts/{cohortId}/summary` | `A` only. Completion and gain across the cohort's classes. |

Notes for the other section 5 endpoints:

- `attention` returns `{notStarted: [...], stuck: [...]}`. Each row has the student, `moduleId`, `activityId`, and for stuck rows `reasons`: `repeated_attempts`, `asked_for_hints` (3 or more hints on the current activity), `taking_longer_than_expected` (needs `estimatedMinutes` on the activity), or `inactive`. Thresholds come from the class `settings` (`stuckFailedAttempts` 3, `stuckTimeMultiplier` 2, `notStartedDays` 1, `inactiveSchoolDays` 3). Inactivity is counted in school days (Monday to Friday).
- `concepts` rows have the gain fields plus `masteryPct`, the share of post-tested students at or above 80% on that concept ("80% stuck on loops" is `100 - masteryPct`), and `postN`.
- `review-queue` takes `limit` and `cursor`; each item has a `submissionId` (use it in the review route), the student, and the free-text `answers`. A reviewed submission leaves the queue.
- `export` returns `text/csv` (not the JSON envelope) with `Content-Disposition: attachment`. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'`. Every export is written to the audit log.
- `GET /classes/{classId}/progress` returns `{modules, students}`, where each student has `modules[moduleId] = {state, percent, activeMinutes}` and a `resume` pointer.
- `GET /admin/cohorts/{cohortId}/summary` has the same shape as the read API cohort summary, but is not suppressed for small groups.

`GET /classes/{classId}/modules/{moduleId}/gain`:

```json
{ "data": {
  "definitions": { "gain": "post - pre, percentage points", "normalizedGain": "(post - pre) / (100 - pre)" },
  "class": { "nEnrolled": 28, "n": 24, "meanPre": 41.2, "meanPost": 73.8,
             "meanGain": 32.6, "normalizedGain": 0.55 },
  "byConcept": [ { "concept": "loops", "n": 24, "meanPre": 30.0, "meanPost": 71.0,
                   "meanGain": 41.0, "lowItemCount": false } ],
  "students": [ { "studentId": "stu_01", "displayName": "Ana R.", "pre": 40, "post": 80,
                  "gain": 40, "normalizedGain": 0.67 },
                { "studentId": "stu_02", "displayName": "Ben T.", "pre": 50, "post": null,
                  "gain": null, "normalizedGain": null } ]
} }
```

---

## 6. Student player

Student session only. `studentId` and `classId` always come from the session, never from the request.

| Method | Path | Purpose |
|---|---|---|
| GET | `/student/home` | Assigned modules with state (`locked`, `available`, `in_progress`, `complete`, `catch_up`), progress percent, and the **resume** pointer `{moduleId, activityId}`. The pointer starts at the student's start module (see architecture.md 7.2). The UI renders it and computes nothing. |
| GET | `/student/modules/{moduleId}` | The pinned module version, **sanitized** (no answer keys), with per-activity state. 403 `MODULE_LOCKED` if not unlocked. |
| PUT | `/student/modules/{moduleId}/activities/{activityId}/draft` | Autosave worksheet answers |
| POST | `/student/modules/{moduleId}/activities/{activityId}/heartbeat` | `{seconds}` of active time (credited up to 45 per call) |
| POST | `/student/modules/{moduleId}/activities/{activityId}/submit` | Submit answers, get grading and the next state |
| POST | `/student/modules/{moduleId}/activities/{activityId}/complete` | Mark a video or slides activity done |
| POST | `/student/hints` | A Socratic hint on a check or worksheet question (below) |

`POST .../submit`

```json
// request
{ "clientSubmissionId": "7c1e...", "answers": [ { "questionId": "q1", "value": "B" } ] }
// 200 for a check activity
{ "data": { "scorePct": 67, "passed": true,
            "results": [ { "questionId": "q1", "correct": true, "explanation": "..." } ],
            "activityState": "complete",
            "next": { "type": "activity", "activityId": "a-ws" },
            "moduleUnlocked": null } }
// 200 for an assessment: no scores or answers are revealed
{ "data": { "recorded": true, "activityState": "complete",
            "next": { "type": "activity", "activityId": "a-vid" } } }
```

- Repeating the same `clientSubmissionId` returns the first result (safe retries on a bad connection). It is 8 to 64 characters of letters, digits, `-` or `_`.
- Activities open in order. Submitting a later activity before the earlier required ones are done returns 403 `ACTIVITY_LOCKED`.
- For worksheets, `questionId` in each answer is the field's `fieldId`. Fields with an answer key are scored on submit. The rest go to the review queue and the response has `pendingReview: true`.
- `exit` questions and assessments return `recorded: true` with no scores. Only `check` returns `scorePct`, `passed` and `results`.
- `POST .../complete` (video and slides) returns 409 `TOO_EARLY` until the activity's `minSeconds` of active time has been recorded by heartbeats.
- `heartbeat` takes `{"seconds": 1-120}` and credits at most 45 seconds per call.
- An assessment can be submitted once. A second try returns 403 `ASSESSMENT_ALREADY_SUBMITTED`.
- When the last required activity completes, the response includes `moduleUnlocked: "<nextModuleId>"`.
- Grading uses the `answerKey` stored server-side. Worksheet fields without a key go to the instructor review queue and show as "submitted".

### `POST /student/hints`

```json
// request: question or code (at least one). questionId is optional and picks one question.
{ "moduleId": "py-loops", "activityId": "chk", "questionId": "c1",
  "question": "I do not get what goes in the blank", "code": "for i in ___(5):" }
// 200
{ "data": { "hint": "Think about what generates a sequence of numbers.", "level": 1, "remainingToday": 9 } }
```

- **Where it works.** Only `check` and `worksheet` activities, and only when the student could open the activity. Tests (`assessment`) and everything else return 403 `HINTS_NOT_ALLOWED`, so a hint can never change a pretest or post-test score.
- **Levels.** The first hint on an activity is a gentle question (level 1), the second names the concept (level 2), and the third and later show a tiny worked example on a different problem (level 3).
- **Limits.** 10 hints per student per day (429 `HINT_LIMIT_REACHED`) and a cap for the whole app per month, `hintsMonthlyCap`, default 5000 (429 `AI_QUOTA_EXCEEDED`). A hint is counted before the model is called and given back if the call fails, which returns 503 `HINTS_UNAVAILABLE`. The route is throttled to 10 per second.
- **Fields.** `question` up to 500 characters and `code` up to 4000. Unknown fields are rejected.
- **What the model sees.** The activity title, the question text and choices, the concept, the student's own text, and a "do not say" list of the answers so it can steer around them. It never sees the student's name, an explanation, or the raw answer key. Student text is passed as quoted data.
- **What the student sees.** The reply is cleaned (echoed tags and labels removed) and checked: it must not contain an answer (also when punctuation is attached or the letters are spelled out), "the answer is", more than a few lines of code, or more than 600 characters. If it fails, the student gets a generic hint for that level instead. The student cannot tell the difference.
- **Teacher review.** Each hint is logged in the events table under `HINT#<classId>` with the student ID, activity, concepts, level, the student's question, the hint shown, whether it was replaced, and token counts. Entries expire after 180 days. The student's name is not stored. The count of hints per activity (`hintCount`) feeds the "stuck" list in `GET /classes/{id}/attention` (reason `asked_for_hints`, at 3 or more).
- **Model.** Amazon Nova Lite in `us-west-2` by default (`bedrockRegion`, `hintModelId`). About $0.00003 per hint, so a full 5000 hints is about $0.15.

---

## 7. Read API for CIC's org dashboard

Key auth, scope `read:cohorts`. Read-only. All responses are aggregates with the same `definitions` object as section 5.

| Method | Path | Purpose |
|---|---|---|
| GET | `/read/cohorts` | Cohorts with class count, enrolled, completion %, gain |
| GET | `/read/cohorts/{cohortId}/summary` | Completion and learning gain for one cohort, with per-class and per-module rows |
| GET | `/read/classes/{classId}/summary` | Same for one class |
| GET | `/read/modules/{moduleId}/gain?cohortId=` | Gain for a module across a cohort or everyone |
| GET | `/read/concepts/gain?cohortId=` | Gain by concept ("students gained 32 points on loops") |
| GET | `/read/progress?groupBy=cohort\|class\|module\|org&from=&to=` | Completion over a period, grouped |

Query parameters: `from` and `to` (dates like `2026-11-15`, UTC, both inclusive), `orgId`, `cohortId`, `classId`, `groupBy` (`cohort`, `class`, `module`, `org`; default `cohort`).

- With a period, a module counts as started or completed only if that happened inside it, and a (pre, post) pair counts only if the post-test was taken inside it. Enrollment is always the current roster.
- `/read/modules/{moduleId}/gain` and `/read/concepts/gain` accept `cohortId`, `classId` or `orgId` to narrow the scope. With none, they cover every class.
- Auth: send `X-Api-Key: cic_<keyId>_<secret>`. The key item in the core table is `KEY#<keyId>` / `META` with `secretHash` (sha256 hex of the secret), `scopes` (list, needs `read:cohorts`), `label`, `createdBy`, `createdAt`, and `revokedAt` when revoked. The admin endpoint that creates keys must store exactly these fields.
- Every route is throttled to 5 requests per second (burst 10). Any report can be filtered by cohort or by class.

`GET /read/cohorts/{cohortId}/summary` (a real response from the tests, with 8 students in 2 classes):

```json
{ "data": {
  "generatedAt": "2026-11-15T01:23:40Z",
  "cohort": { "cohortId": "coh1", "name": "Maryvale" },
  "cohortId": "coh1",
  "enrolled": 8, "classes": 2, "assignedModules": 1,
  "completion": { "completionPct": 62.5, "startedPct": 100.0 },
  "learningGain": { "nEnrolled": 8, "n": 8, "meanPre": 43.8, "meanPost": 76.2, "meanGain": 32.5,
                    "normalizedGain": 0.58, "suppressed": false },
  "byModule": [ { "moduleId": "m1", "title": "Loops", "completionPct": 62.5, "nEnrolled": 8, "n": 8,
                  "meanPre": 43.8, "meanPost": 76.2, "meanGain": 32.5, "normalizedGain": 0.58, "suppressed": false } ],
  "byClass": [
    { "classId": "cls1", "name": "Class cls1", "enrolled": 5, "completionPct": 100.0, "nEnrolled": 5, "n": 5,
      "meanPre": 40.0, "meanPost": 80.0, "meanGain": 40.0, "normalizedGain": 0.67, "suppressed": false },
    { "classId": "cls2", "name": "Class cls2", "enrolled": 3, "completionPct": 0.0, "nEnrolled": 3, "n": 3,
      "meanPre": null, "meanPost": null, "meanGain": null, "normalizedGain": null, "suppressed": true } ],
  "definitions": { "gain": "post - pre, in percentage points", "completionPct": "share of (active student, assigned module) pairs where the module is complete" }
} }
```

- Groups with fewer than 5 students return `suppressed: true` and null metrics.
- No student names, IDs, codes, or free-text answers appear anywhere in this API.
- 401 for a missing, unknown, or revoked key. 403 if the scope is missing. Throttling is per route (see section 8), not per key.
- An MCP wrapper over these same functions is possible later. It would add no new data access.

---

## 8. Route to Lambda to authorizer map

Generated from the synthesized CDK stack, so it shows what is deployed, not what was planned. Table access is the DynamoDB actions the function's IAM role allows: **r** read, **w** write.

| Routes | Lambda | Authorizer | Access |
|---|---|---|---|
| `GET /health` | `health` | none (public) | none |
| `POST /auth/student/login` | `auth-student` | none (public, throttled) | core rw, pepper secret (read) |
| `POST /auth/student/logout` | `auth-student` | student session | same as login |
| `GET /me`, `/admin/orgs`, `/admin/cohorts`, `/admin/users`, `/admin/api-keys`, `/admin/audit` | `admin-api` | Cognito JWT | core rw, events rw, Cognito admin actions |
| `/curriculum/*` | `curriculum-api` | Cognito JWT | content rw, core r, assets bucket (write) |
| `/classes` (create, list, update, members, roster, import, credentials, join code, assignments, unlock) and `GET /students`, `GET /students/{id}` | `class-api` | Cognito JWT | core rw, content r, progress (query and delete, to remove a deleted student), pepper secret (read), Cognito (group check) |
| `/classes/{id}/progress`, `students/{id}/progress`, `attention`, `modules/{id}/gain`, `concepts`, `review-queue`, `submissions/{id}/review`, `export`, `/admin/cohorts/{id}/summary`, and `GET /admin/usage` | `reports-api` | Cognito JWT | core r, content r, progress rw (review updates), events w (export audit) |
| `/student/*` (including `POST /student/hints`) | `student-api` | student session | core r, content r, progress rw, events rw (hint counters and log), Bedrock `InvokeModel` on one named model |
| `/read/*` | `read-api` | API key | core r, content r, progress r |

Authorizers (not routes):

| Authorizer | Lambda | Access | Cache |
|---|---|---|---|
| Student session (`Authorization: Bearer ses_...`) | `authorizer-student` | core r | 60 s |
| API key (`X-Api-Key`) | `authorizer-apikey` | core rw (records `lastUsedAt`) | 60 s |

Cognito JWT authorizer is built in to API Gateway and has no Lambda.

Throttling is per route, across all callers. The default for every route is 50 requests per second with a burst of 100.

| Routes | Limit |
|---|---|
| `POST /auth/student/login` | 5 per second, burst 10 |
| `POST /student/.../heartbeat` | 30 per second, burst 60 |
| `/read/*` | 5 per second, burst 10 |
| `POST /student/hints` | 10 per second, burst 20 |

