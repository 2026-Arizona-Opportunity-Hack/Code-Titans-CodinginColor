# Setup guide

How to go from an empty AWS account and a laptop to a working copy of CIC Learn, in the order you need to do things. It takes about an hour the first time, most of it waiting for CloudFormation.

Other pages cover what comes after: [operations.md](operations.md) (daily tasks, backups, troubleshooting), [configuration.md](configuration.md) (every setting in one place) and [user-guide.md](user-guide.md) (how each kind of user works in the app).

**You will end up with:** a deployed backend (API, database, sign-in), a hosted website, one admin account, and a first class you can log in to as a student.

## 0. What you need

| Need | Notes |
|---|---|
| An AWS account | You need permission to create CloudFormation stacks, Lambda, API Gateway, DynamoDB, Cognito, S3, CloudFront, Secrets Manager, IAM roles and Amplify apps. An administrator role does it. |
| AWS CLI v2, signed in | `aws sts get-caller-identity` must print your account. Use a named profile (`AWS_PROFILE`) if you have several accounts. |
| Node.js **20.9 or newer** and npm | Next.js 16 needs 20.9+. The project was built and tested on Node 24. |
| Python **3.12 or newer** | Runs the Lambda tests and the optional seed script. The Lambdas themselves run on the Python 3.12 runtime. |
| Git | To clone the repository. |
| Access to Amazon Bedrock models | Needed for AI hints and "Draft from a file". Step 4 shows how. Everything else works without it. |

Everything is deployed in **one region**. We use `us-west-2`. The AI features call Bedrock in the region set by `bedrockRegion`, which defaults to the same one.

Cost at classroom scale is expected to be a few dollars a month. That is an estimate from AWS pricing (see [architecture.md](architecture.md) section 12), not a bill.

## 1. Get the code

```bash
git clone https://github.com/2026-Arizona-Opportunity-Hack/Code-Titans-CodinginColor.git
cd Code-Titans-CodinginColor
```

The repository has two apps and the docs:

| Folder | What it is |
|---|---|
| `backend/` | AWS CDK (TypeScript) that defines all infrastructure, plus the Python Lambda functions |
| `frontend/` | The Next.js website, built to static files |
| `docs/` | This guide and the design, API, decision and operations docs |

## 2. Check your machine

```bash
node -v                       # v20.9.0 or newer
python3 --version             # 3.12 or newer
aws --version                 # aws-cli/2.x
export AWS_PROFILE=<your profile>      # skip if you use the default profile
export AWS_REGION=us-west-2
aws sts get-caller-identity   # prints your account ID
```

## 3. Run the tests (no AWS needed)

Do this first. It proves your tools work before you touch AWS.

```bash
# Backend: CDK assertions (jest) and Lambda tests (pytest against an in-memory DynamoDB)
cd backend
npm install
npm test
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python3 -m pytest test -q -p no:cacheprovider
npx tsc --noEmit
cd ..

# Frontend: lint and type check
cd frontend
npm install
npm run lint
npx tsc --noEmit
cd ..
```

Everything should pass. If a test fails on a fresh clone, stop and fix that before deploying.

## 4. Turn on Bedrock models

AI hints use **Amazon Nova Lite**. "Draft from a file" uses **Claude Haiku 4.5** and falls back to **Amazon Nova Pro**. In the AWS console, open **Amazon Bedrock** in your region and make sure your account can use them. Amazon models are normally available as soon as the account can call Bedrock.

Anthropic models ask for a short use-case form once per account. Until it is submitted, Haiku calls fail with "Model use case details have not been submitted" and drafting uses Nova Pro, so the feature still works.

Check that Nova Lite answers (it should print a short reply):

```bash
echo '{"messages":[{"role":"user","content":[{"text":"Reply with one word: ready"}]}],"inferenceConfig":{"maxTokens":10}}' > /tmp/nova.json
aws bedrock-runtime invoke-model --model-id amazon.nova-lite-v1:0 --body fileb:///tmp/nova.json \
  --content-type application/json /tmp/nova-out.json --region us-west-2 && cat /tmp/nova-out.json
```

If you skip this step, deploy anyway. Hints will say "unavailable" until access is granted.

## 5. Choose your allowed origins

`backend/cdk.json` has a `context` block with the deployment settings. The one you must look at is **`allowedOrigins`**: the web addresses that may call the API and upload files. It is comma-separated and never `*`.

```json
"allowedOrigins": "https://<your-site>.amplifyapp.com,http://localhost:3000"
```

You do not know the hosted address yet. Use `http://localhost:3000` for now and add the real one in step 10. The first address that is not `localhost` is also used to build the links printed on student login sheets.

The other settings (`staffMfa`, `bedrockRegion`, `hintModelId`, `hintsMonthlyCap`) have working defaults. See [configuration.md](configuration.md).

## 6. Deploy the backend

```bash
cd backend
npx cdk bootstrap          # once per account and region
npx cdk diff               # read what will be created
npx cdk deploy --all       # three stacks: Data, Auth, Api
```

The first deploy takes several minutes. When each stack finishes, CDK prints its outputs. You need these:

| Output | Stack | Used for |
|---|---|---|
| `ApiUrl` | `CicCurriculumApiStack` | The API address. The frontend wants it with `/v1` added |
| `UserPoolId` | `CicCurriculumAuthStack` | Staff sign-in, and the admin commands in step 7 |
| `UserPoolClientId` | `CicCurriculumAuthStack` | Staff sign-in |

If you missed them, print them again:

```bash
aws cloudformation describe-stacks --stack-name CicCurriculumApiStack  --query 'Stacks[0].Outputs' --output table
aws cloudformation describe-stacks --stack-name CicCurriculumAuthStack --query 'Stacks[0].Outputs' --output table
```

Check the API is up (use your own `ApiUrl`):

```bash
curl <ApiUrl>/v1/health        # {"data": {"status": "ok"}}
```

Tables, the user pool, the image bucket and the student-credential secret are **retained** if you ever delete a stack, so student data is never lost by accident.

## 7. Create the first admin

Nobody can sign up on their own, so the first admin comes from the command line. After this, admins invite everyone else from the **Users** screen.

```bash
POOL=<UserPoolId>
EMAIL=you@example.org
aws cognito-idp admin-create-user --user-pool-id $POOL --username $EMAIL \
  --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true Name=name,Value="Your Name" \
  --desired-delivery-mediums EMAIL
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username $EMAIL --group-name cic_admin
```

Cognito emails a temporary password. The first sign-in asks you to choose a new password (12 or more characters, with upper case, lower case and a number) and to set up an authenticator app (TOTP). Multi-factor sign-in is required for all staff by default.

Cognito's built-in email sender allows only a small number of messages per day. If the email does not arrive, check spam, then see [operations.md](operations.md#troubleshooting).

## 8. Configure the frontend

```bash
cd frontend
cp .env.example .env.local
```

Open `.env.local` and fill in the values from step 6:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | `false` (leave it) |
| `NEXT_PUBLIC_API_URL` | `ApiUrl` plus `/v1`, for example `https://abc123.execute-api.us-west-2.amazonaws.com/v1` |
| `NEXT_PUBLIC_AWS_REGION` | `us-west-2` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `UserPoolClientId` |

`.env.local` is ignored by git. Only `NEXT_PUBLIC_` values reach the browser, so never put a secret in this file.

## 9. Run the website on your machine

```bash
npm install          # if you have not already
npm run dev          # http://localhost:3000
```

Open http://localhost:3000/login/ and sign in as the admin from step 7. This only works if `http://localhost:3000` is in `allowedOrigins`. If the page loads but nothing fills in, open the browser console: a CORS error means the origin is missing.

The first time a student runs Python, the browser downloads about 12 MB (Pyodide) from a public CDN, so the machine needs internet.

## 10. Publish the website

The site is a folder of static files. Hosting uses AWS Amplify with a manual zip upload, so no GitHub connection or token is needed.

```bash
# Once: create the Amplify app and its branch
aws amplify create-app --name cic-curriculum --region us-west-2        # note the appId
aws amplify create-branch --app-id <appId> --branch-name main --region us-west-2

# Every time you publish
cd frontend
npm run build                                   # writes frontend/out/
(cd out && zip -qr /tmp/site.zip .)
aws amplify create-deployment --app-id <appId> --branch-name main      # prints jobId and zipUploadUrl
curl -X PUT -H "Content-Type: application/zip" --data-binary @/tmp/site.zip "<zipUploadUrl>"
aws amplify start-deployment --app-id <appId> --branch-name main --job-id <jobId>
```

The site is at `https://main.<appId>.amplifyapp.com` once the job finishes. Then **add that address to `allowedOrigins`** in `backend/cdk.json` (put it first, before `http://localhost:3000`) and redeploy the backend:

```bash
cd backend && npx cdk deploy --all
```

Without this the hosted site cannot call the API, and login sheets will print the wrong address.

## 11. Set up a first class

Sign in to the hosted site as the admin.

1. **Schools, Add a school.** Choose kind **CIC**. Every class belongs to a school.
2. **Users, Invite someone.** Invite an instructor with that school. Tick "Curriculum author" if they should write modules. They receive an email like yours.
3. Load a starter module so there is something to teach. This needs `pip install boto3` and your AWS profile:

   ```bash
   AWS_PROFILE=<your profile> AWS_REGION=us-west-2 python3 backend/seed/seed_module.py backend/seed/python-practice.json           # checks only
   AWS_PROFILE=<your profile> AWS_REGION=us-west-2 python3 backend/seed/seed_module.py backend/seed/python-practice.json --apply   # writes it
   ```

   Or write your own under **Curriculum, New module** (see [user-guide.md](user-guide.md#curriculum-authors)).
4. Sign in as the instructor. **Classes, New class.** Then **Add students from a CSV** (a file with a `displayName` column), choose modules under **Assigned modules**, and open **Login sheet**. Print it.
5. Open the site's `/s/` page (or a link from the sheet) as a student: enter the class code and the three words.

## 12. Checklist

You are done when each of these is true:

- [ ] `curl <ApiUrl>/v1/health` returns `{"data": {"status": "ok"}}`
- [ ] You can sign in at `/login/` as the admin, with MFA
- [ ] The Curriculum screen lists at least one published module
- [ ] A student can log in with a class code and words, and start the first step
- [ ] On a coding step, **Check my code** runs and shows results
- [ ] On a check or worksheet step, **Ask for a hint** returns a hint (needs Bedrock access)
- [ ] The teacher's **Progress** page shows that student
- [ ] The hosted site's address is in `allowedOrigins`

## When something goes wrong

The troubleshooting table in [operations.md](operations.md#troubleshooting) covers the common problems: CORS errors, student logins that always fail, missing invite emails, Bedrock errors and leftover resources from an earlier stack.

## Updating and removing

- **Update the backend:** `cd backend && npx cdk diff && npx cdk deploy --all`.
- **Update the website:** rebuild and upload the zip (step 10). Merging code to Git does not publish it.
- **Remove everything:** see "Backups and teardown" in [operations.md](operations.md#backups-and-teardown). Retained resources must be deleted by hand.
