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

**Roles in tables below:** `A` = cic_admin, `I` = instructor (member of that class), `R` = reviewer, `S` = student, `Au` = staff user with the `canAuthor` flag.

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
| 403 | `FORBIDDEN`, `MODULE_LOCKED`, `ASSESSMENT_ALREADY_SUBMITTED` |
| 404 | `NOT_FOUND` |
| 409 | `REVISION_CONFLICT`, `DUPLICATE_SUBMISSION`, `ALREADY_PUBLISHED` |
| 429 | `LOGIN_THROTTLED` (with `Retry-After`), `RATE_LIMITED`, `AI_QUOTA_EXCEEDED` |
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
| POST | `/admin/users` | Invite a user `{email, name, role: instructor\|reviewer\|cic_admin, canAuthor?}` (Cognito admin-create-user) |
| PATCH | `/admin/users/{userId}` | Change role, set `canAuthor`, or disable |
| GET, POST | `/admin/orgs` | List or create partner schools |
| PATCH | `/admin/orgs/{orgId}` | Rename or archive |
| GET, POST | `/admin/cohorts` | List or create cohorts `{name, orgId?}` |
| PATCH | `/admin/cohorts/{cohortId}` | Rename, archive, or set its classes `{name?, status?, classIds?}`. `classIds` is the full list: classes missing from it are removed, and a class listed here moves out of any other cohort. |
| GET | `/admin/api-keys` | List keys (label, scopes, lastUsedAt, revoked). Never the secret. |
| POST | `/admin/api-keys` | Create `{label, scopes: ["read:cohorts"]}`. The full key is in this response only. |
| DELETE | `/admin/api-keys/{keyId}` | Revoke |
| GET | `/admin/audit?from=&to=` | Audit entries (key created, export, publish, roster import) |

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
| GET | `/curriculum/modules/{moduleId}/versions/{n}` | A, I, R | A specific version |
| GET | `/curriculum/concepts` | A, I, R | Concept tags in use (for the tag picker and reports) |
| POST | `/curriculum/assets/upload-url` | A, Au | Presigned S3 PUT for an image `{contentType, size}`. PNG, JPEG, or WebP, max 5 MB. |

**Publish validation** (400 `VALIDATION_ERROR` with a list of problems): at least one pretest and one post-test; every assessment question has a `concept`, an answer key, and points; pre and post cover the same concepts; video IDs match the allowlist; no empty prompts.

`PUT .../draft` body is the module document shown in architecture.md section 6.

**Reviewer preview.** Reviewers use `GET /curriculum/modules/{id}` and render it in a read-only preview. No progress or submission endpoint is reachable with a reviewer token.

---

## 4. Classes, roster, assignments

`I` means the caller must be a member of that class. `A` can access every class.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/classes` | I, A | Create `{name, orgId, cohortId?, termStart?, termEnd?}`. The creator becomes a member. |
| GET | `/classes` | I, A | My classes. A can pass `orgId`, `cohortId`. |
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
| POST | `/classes/{classId}/roster/{studentId}/merge` | I, A | **After the demo.** Merge a duplicate into `{intoStudentId}`, keeping the better result per activity |
| DELETE | `/classes/{classId}/roster/{studentId}` | A | Delete a student and their progress |
| POST | `/classes/{classId}/credentials` | I, A | Generate or reset credentials `{studentIds?}` (all if omitted). Old words stop working and those students' sessions are revoked. The words are returned in this response only. |
| POST | `/classes/{classId}/join-code/rotate` | I, A | Issue a new class code |
| POST | `/classes/{classId}/assignments` | I, A | Assign a module `{moduleId, order?, targetDate?}` pinned to the latest published version |
| GET | `/classes/{classId}/assignments` | I, A | List with version and start counts |
| PATCH | `/classes/{classId}/assignments/{moduleId}` | I, A | Reorder, change target date, move to a newer version (only if nobody started) |
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
| POST | `/student/hints` | **Stretch.** Socratic hint, logs the struggle (below) |

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

- Repeating the same `clientSubmissionId` returns the first result (safe retries on a bad connection).
- An assessment can be submitted once. A second try returns 403 `ASSESSMENT_ALREADY_SUBMITTED`.
- When the last required activity completes, the response includes `moduleUnlocked: "<nextModuleId>"`.
- Grading uses the `answerKey` stored server-side. Worksheet fields without a key go to the instructor review queue and show as "submitted".

### Stretch: `POST /student/hints`

```json
// request
{ "moduleId": "py-loops", "activityId": "a-code", "code": "for i in range(", "question": "why error?" }
// 200
{ "data": { "hint": "What do you think range() needs between its parentheses?", "level": 1, "remainingToday": 7 } }
```

Rate-limited per student per day. A global monthly cap returns 429 `AI_QUOTA_EXCEEDED`. The log entry stores `studentId`, `activityId`, `concept`, hint level, and timestamp. It does not store the student's name. Instructors see a per-concept struggle summary at `GET /classes/{classId}/hints`.

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

Query parameters: `from` and `to` (dates), `orgId`, `cohortId`, `classId`, `groupBy`. Any report can be filtered by cohort or by class.

`GET /read/cohorts/{cohortId}/summary`:

```json
{ "data": {
  "generatedAt": "2026-11-15T17:00:00Z",
  "cohort": { "cohortId": "coh_maryvale", "name": "Maryvale" },
  "enrolled": 62, "classes": 3,
  "completion": { "assignedModules": 4, "meanCompletionPct": 71.5 },
  "learningGain": { "n": 54, "meanPre": 38.4, "meanPost": 70.9, "meanGain": 32.5, "normalizedGain": 0.53 },
  "byModule": [ { "moduleId": "py-loops", "n": 51, "meanGain": 34.0 } ],
  "byClass": [ { "classId": "cls_01", "n": 4, "suppressed": true, "meanGain": null } ]
} }
```

- Groups with fewer than 5 students return `suppressed: true` and null metrics.
- No student names, IDs, codes, or free-text answers appear anywhere in this API.
- Throttled per key. 401 for a missing, unknown, or revoked key. 403 if the scope is missing.
- An MCP wrapper over these same functions is possible later. It would add no new data access.

---

## 8. Route to Lambda to authorizer map

| Route prefix | Lambda | Authorizer | Table access |
|---|---|---|---|
| `/auth/student/*` | `auth-student` | none (throttled) | core (rw), credential pepper (read secret) |
| `/me`, `/admin/*` | `admin-api` | Cognito JWT | core (rw), events (w), Cognito admin actions |
| `/curriculum/*` | `curriculum-api` | Cognito JWT | content (rw), events (w), assets bucket (put) |
| `/classes` (CRUD, roster, credentials, assignments) | `class-api` | Cognito JWT | core (rw), progress (r), events (w), credential pepper (read secret) |
| `/classes/*/progress, attention, gain, concepts, review-queue, export, /admin/cohorts/*/summary` | `reports-api` | Cognito JWT | progress (r), core (r), content (r) |
| `/student/*` | `student-api` | `authorizer-student` | progress (rw), core (r), content (r), events (w) |
| `/read/*` | `read-api` | `authorizer-apikey` | progress (r), core (r), content (r) |

Gateway throttling: tighter on `/auth/*`, moderate on `/student/*` (heartbeats), low on `/read/*`.
