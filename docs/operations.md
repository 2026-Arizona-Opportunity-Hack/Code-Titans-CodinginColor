# Operations runbook

How to run and maintain CIC Learn once it is deployed. For the first deployment, start with [setup.md](setup.md); settings are listed in [configuration.md](configuration.md). It is written so that someone who did not build it can follow it. Commands assume a Mac or Linux terminal and the AWS CLI.

Contents: [Prerequisites](#prerequisites) · [First deploy](#first-deploy) · [Create the first admin](#create-the-first-admin) · [Host the frontend](#host-the-frontend) · [Everyday tasks](#everyday-tasks) · [Updating](#updating) · [Monitoring and cost](#monitoring-and-cost) · [Backups and teardown](#backups-and-teardown) · [Troubleshooting](#troubleshooting)

## Prerequisites

| Need | Why |
|---|---|
| An AWS account and a CLI profile with permission to deploy CloudFormation, Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront, Secrets Manager, IAM and Amplify | Everything is deployed with CDK |
| Node 20+, Python 3.12+ | CDK and its tests, the Lambda tests |
| Amazon Bedrock access to the hint model (`amazon.nova-lite-v1:0` by default) in the region set by `bedrockRegion` | AI hints. Without it everything else works and hints answer "unavailable" |
| Bedrock access to **Amazon Nova Pro** and, optionally, **Claude Haiku 4.5** in the same region | "Draft from a file (AI)" in the Curriculum screen. It tries Haiku first and falls back to Nova Pro. Anthropic models need a one-time use-case form per account (Bedrock console, Model access). Until that is submitted, Haiku calls fail and drafting uses Nova Pro. Without either, only that button is affected |

Check Bedrock access before the first deploy (it should print a short reply):

```bash
echo '{"messages":[{"role":"user","content":[{"text":"Reply with one word: ready"}]}],"inferenceConfig":{"maxTokens":10}}' > /tmp/nova.json
aws bedrock-runtime invoke-model --model-id amazon.nova-lite-v1:0 --body fileb:///tmp/nova.json \
  --content-type application/json /tmp/nova-out.json --region us-west-2 && cat /tmp/nova-out.json
```

## First deploy

```bash
git clone https://github.com/2026-Arizona-Opportunity-Hack/Code-Titans-CodinginColor.git
cd Code-Titans-CodinginColor/backend
npm install
export AWS_PROFILE=<your profile> AWS_REGION=us-west-2

npx cdk bootstrap            # once per account and region
```

Set `allowedOrigins` in `backend/cdk.json` to the origins that may call the API: your hosted site URL and `http://localhost:3000`. It is comma-separated and never `*`. If you do not have a hosted URL yet, use `http://localhost:3000` now and add the URL later (see [Host the frontend](#host-the-frontend)).

```bash
npx cdk diff                 # read what will change
npx cdk deploy --all         # three stacks: Data, Auth, Api
```

When it finishes, copy the outputs. You need them for the frontend and the first admin:

| Output | Used for |
|---|---|
| `ApiUrl` | `NEXT_PUBLIC_API_URL` is this value plus `/v1` |
| `UserPoolId`, `UserPoolClientId` | `NEXT_PUBLIC_COGNITO_USER_POOL_ID` and `..._CLIENT_ID`, and the admin commands below |

Check the API is up: `curl <ApiUrl>/v1/health` returns `{"data": {"status": "ok"}}`.

## Create the first admin

Nobody can sign up by themselves, so the first admin is created with the CLI. After that, admins invite everyone else from the Users screen.

```bash
POOL=<UserPoolId>
EMAIL=you@example.org
aws cognito-idp admin-create-user --user-pool-id $POOL --username $EMAIL \
  --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true Name=name,Value="Your Name" \
  --desired-delivery-mediums EMAIL
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username $EMAIL --group-name cic_admin
```

Cognito emails a temporary password. On the first sign-in at `/login` the person chooses a new password (12 or more characters) and sets up an authenticator app. After that the admin should add a school (Schools) before inviting instructors, because instructors create classes in the school they are assigned.

## Host the frontend

The frontend is a static export. Create the Amplify app once, then upload builds.

```bash
# once
aws amplify create-app --name cic-curriculum --region us-west-2        # note the appId
aws amplify create-branch --app-id <appId> --branch-name main --region us-west-2
```

Put the values from the outputs in `frontend/.env.local` (copy `.env.example`) with `NEXT_PUBLIC_USE_MOCKS=false`. Then publish:

```bash
cd frontend && npm install && npm run build            # writes frontend/out/
(cd out && zip -qr /tmp/site.zip .)
aws amplify create-deployment --app-id <appId> --branch-name main     # prints jobId and zipUploadUrl
curl -X PUT -H "Content-Type: application/zip" --data-binary @/tmp/site.zip "<zipUploadUrl>"
aws amplify start-deployment --app-id <appId> --branch-name main --job-id <jobId>
```

Amplify prints the site address (`https://main.<appId>.amplifyapp.com`). Add that address to `allowedOrigins` in `backend/cdk.json` and run `npx cdk deploy --all` again, so the browser is allowed to call the API. Check the site returns the security headers listed in [backend/README.md](../backend/README.md#frontend-hosting): `curl -sI <site>/ | grep -i strict-transport`.

## Everyday tasks

| Task | How |
|---|---|
| Invite a CIC instructor, author, reviewer or admin | Sign in as admin, Users, Invite someone. Choose the school. Tick "Curriculum author" to let an instructor create and edit modules |
| Add a school | Admin, Schools, Add a school. Choose **CIC** for CIC instructors or **External** for a partner teacher |
| Approve a teacher from outside CIC | Admin, Access requests. Approve creates an external school (or use an existing one) and sends the invite |
| See how external classes are used | Admin, Usage. It shows counts and dates only |
| Create a cohort | Admin, Cohorts. Add classes to it |
| Create a key for CIC's dashboard | Admin, API keys. The key is shown once. Revoke it from the same screen |
| Review what was done | Admin, Audit log (key changes, exports, access-request decisions) |
| Set up a class | Teacher, Classes, New class. Import the roster (CSV), assign modules, print the login sheet |
| Student lost their words | Teacher, the class, Login sheet, create new words for that student. The old words stop working |
| Rotate a class code | Teacher, the class settings |
| Write or edit a module | Author, Curriculum, New module or Edit. Save draft, then Publish. Move classes to the new version from "Classes using this module" |
| Load the starter module | `AWS_PROFILE=<profile> python3 backend/seed/seed_module.py backend/seed/python-practice.json --apply` (needs `pip install boto3`; leave off `--apply` to only check it) |
| Download grades | Teacher, the class, Gradebook, Download CSV |

## Updating

| Change | Do |
|---|---|
| Backend code or infrastructure | Review `npx cdk diff`, then `npx cdk deploy --all` from `backend/` |
| Frontend code | Build and upload (see [Host the frontend](#host-the-frontend)). Merging to Git does not update the site by itself |
| Allowed origins, hint model, monthly hint cap, MFA mode | Edit the keys in `backend/cdk.json` (documented in the README) and redeploy the backend |
| A new API endpoint | Follow "Adding an endpoint" in [backend/README.md](../backend/README.md) and keep [api.md](api.md) in step |

Run the tests before deploying: `cd backend && npm test && python3 -m pytest test -q -p no:cacheprovider`, and `cd frontend && npm run lint && npx tsc --noEmit`.

## Monitoring and cost

- **Logs.** Each Lambda writes to its own CloudWatch log group (`/aws/lambda/CicCurriculumApiStack-...`) and keeps entries for 14 days. Code logs IDs and counts, and the logging helper (`cic/log.py`) replaces any field named like a name, email, token, class code, secret words, answers or CSV with `[redacted]`. The API's access log holds only request ID, route, status, latency and integration error.
- **Errors to look for.** An `unhandled_error` event means a bug. A `hint_model_error` event means Bedrock failed (students see "Hints are unavailable right now").
- **Hints.** Counters live in the events table: `HQ#<studentId>` per student per day, and `HQM / M#<yyyymm>` for the month. The monthly cap is `hintsMonthlyCap`. Each hint is logged under `HINT#<classId>` for 180 days and shown to teachers on the class Hints page.
- **Cost.** Everything is pay per use (DynamoDB on demand, Lambda, API Gateway, Cognito's free tier, Secrets Manager at about $0.40 for the pepper). At classroom scale it is expected to stay in the low single-digit dollars per month. That is an estimate from AWS pricing, not a measured bill. A hint costs about $0.00003, so the full 5000 hint cap is about $0.15. The stack does not create an AWS Budget, so check Cost Explorer now and then, or add a Budget alert in the account.
- **No alarms are set up.** The stack creates no CloudWatch alarms. Look at the Lambda logs for the events above if something seems wrong.

## Backups and teardown

- **Backups.** The DynamoDB tables have point-in-time recovery on. To restore, use the DynamoDB console or `aws dynamodb restore-table-to-point-in-time` to a new table, then point the stack at it or copy items back.
- **Retained on purpose.** Deleting a stack never deletes the tables, the Cognito user pool, the image bucket or the student credential pepper. This protects student data from a mistake. It also means redeploying a deleted stack creates a second set of these, so remove the old ones by hand.
- **To remove everything.** `npx cdk destroy --all`, then delete the retained resources in the console (tables, user pool, bucket, the pepper secret), and delete the Amplify app.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Every student login says "Class code or student words are incorrect", though they are right | The login Lambda and the thing that issued the words used different pepper secrets. Two `StudentAuthCredentialPepper-…` secrets can exist after a stack was recreated. The live one is the ARN in the `PEPPER_SECRET_ARN` environment variable of the `AuthStudentFunction` Lambda. Delete the unused secret |
| The browser shows a CORS error, or the site cannot reach the API | The site's address is missing from `allowedOrigins`. Add it to `backend/cdk.json` and redeploy the backend |
| "Your account has no role assigned" after signing in | The user is not in a Cognito group. Add them with `aws cognito-idp admin-add-user-to-group` or change their role on the Users screen |
| An instructor cannot create a class | They have no school. An admin sets it on the Users screen |
| An external teacher cannot create a class | They are not in an external school, or the school is archived |
| "Draft from a file (AI)" says it failed | Check the Lambda logs of the curriculum function. Bedrock access to Nova Pro is needed (see Prerequisites). A PDF over 4.5 MB is refused, so export a smaller one or use `.pptx` |
| Hints say "unavailable" | Bedrock access: check the model is available in `bedrockRegion` (see Prerequisites) and the Lambda logs for `hint_model_error` |
| Hints say "paused for this month" | The monthly cap was reached. Raise `hintsMonthlyCap` and redeploy, or wait for the next month |
| "Getting Python ready" never finishes | The device cannot reach `cdn.jsdelivr.net`. Check the network, or host Pyodide yourself and set `NEXT_PUBLIC_PYODIDE_URL` |
| Staff cannot sign in and never got the invite email | Cognito's default sender has a low daily limit, and invites can land in spam. Resend by deleting and re-inviting the user, or move to Amazon SES |
| A module change is not showing for students | Publishing moves only the publisher's own classes. Other teachers' classes keep their version. Move a class to the new version from the module's "Classes using this module" panel |
| `cdk deploy` says a table or pool already exists | A retained resource from an earlier stack. Remove it by hand (see Backups and teardown) |
