# Configuration reference

Every setting in one place: what you can change, where, and what the fixed limits are. For the order of steps to set things up, see [setup.md](setup.md).

There are three kinds of settings:

| Kind | Where you set it | Who needs it |
|---|---|---|
| [Frontend variables](#frontend-variables) | `frontend/.env.local` before `npm run build` | Whoever publishes the website |
| [Backend settings (CDK context)](#backend-settings-cdk-context) | `backend/cdk.json`, or `-c key=value` on the command line | Whoever deploys the backend |
| [Lambda environment variables](#lambda-environment-variables) | Set by CDK. Do not set by hand | Anyone reading the code |

There are no API keys, passwords or tokens in any of these files. The one secret the system uses is created and held by AWS Secrets Manager ([Secrets](#secrets)).

## Frontend variables

Next.js reads these when it builds the site and writes them into the static files. Anything starting with `NEXT_PUBLIC_` is visible to every visitor, so **never put a secret in one**. Changing a value means rebuilding and publishing again.

Copy `frontend/.env.example` to `frontend/.env.local` (git ignores it) and fill it in.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `NEXT_PUBLIC_USE_MOCKS` | Yes | none | Keep `false`. It is a development switch and must be `false` in any build you publish |
| `NEXT_PUBLIC_API_URL` | Yes | none | The API address **including `/v1`**: the `ApiUrl` stack output plus `/v1`. No trailing slash. Example: `https://abc123.execute-api.us-west-2.amazonaws.com/v1` |
| `NEXT_PUBLIC_AWS_REGION` | Yes | none | Region of the Cognito user pool, for example `us-west-2` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Yes | none | Stack output `UserPoolId`, for example `us-west-2_AbC123xyz` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Yes | none | Stack output `UserPoolClientId` |
| `NEXT_PUBLIC_PYODIDE_URL` | No | `https://cdn.jsdelivr.net/pyodide/v314.0.8/full/` | Where Python for coding exercises is downloaded from (about 12 MB). Set it to a copy you host, **with a trailing slash**, if school networks block the CDN |

If a required value is missing the site loads but staff cannot sign in and nothing loads from the API.

## Backend settings (CDK context)

Set these in the `context` block of `backend/cdk.json`, or override one for a single run:

```bash
npx cdk deploy --all -c hintsMonthlyCap=2000
```

The values are checked when CDK runs. A bad value stops the deploy with a message that says what is wrong.

| Key | Default | Allowed | What it does |
|---|---|---|---|
| `allowedOrigins` | none (**required**) | Comma-separated origins such as `https://main.abc123.amplifyapp.com,http://localhost:3000`. Each is `http(s)://host` with no path. `*` is refused | The browser addresses that may call the API (CORS) and upload files to the image bucket. The first address that is not `localhost` is also the address printed on student login sheets |
| `staffMfa` | `REQUIRED` | `REQUIRED` or `OPTIONAL` | Whether staff must set up an authenticator app. Cognito applies this to the whole user pool |
| `bedrockRegion` | `us-west-2` | A region name | Where Amazon Bedrock is called for hints and for drafting modules |
| `hintModelId` | `amazon.nova-lite-v1:0` | One model ID, no wildcard | The model that answers student hints. The student Lambda's permission covers this one model only |
| `hintsMonthlyCap` | `5000` | Whole number, 0 to 1,000,000 | Hard cap on hints for the whole app per calendar month. At the cap, students see that hints are paused. `0` turns hints off |

After you change `allowedOrigins`, redeploy the backend. After you change anything else, the same: `cd backend && npx cdk deploy --all`.

The file also contains a few CDK feature flags (keys starting with `@aws-cdk/`). Leave them alone.

### Models used by "Draft from a file"

The drafting feature uses Claude Haiku 4.5 first and Amazon Nova Pro if Haiku fails, through US inference profiles in `bedrockRegion`. They are set in `backend/lib/domains/curriculum.ts` (permissions) and `backend/lambda/curriculum-api/converter.py` (the order), not in `cdk.json`. Changing them means editing both and redeploying.

## Stack outputs

`npx cdk deploy --all` prints these. You can read them again with `aws cloudformation describe-stacks --stack-name <stack> --query 'Stacks[0].Outputs'`.

| Output | Stack | Use |
|---|---|---|
| `ApiUrl` | `CicCurriculumApiStack` | API address. Append `/v1` for `NEXT_PUBLIC_API_URL` |
| `UserPoolId` | `CicCurriculumAuthStack` | `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, and the admin commands in setup step 7 |
| `UserPoolClientId` | `CicCurriculumAuthStack` | `NEXT_PUBLIC_COGNITO_CLIENT_ID` |
| `AssetsBucketName`, `AssetsCdnUrl` | `CicCurriculumDataStack` | The private bucket for uploaded images, PDFs and decks, and the web address that serves them |
| `ContentTableName`, `CoreTableName`, `ProgressTableName`, `EventsTableName` | `CicCurriculumDataStack` | The four DynamoDB tables |

## Lambda environment variables

CDK sets these. They hold names and addresses, never secret values. They are listed so you can find a cause quickly when reading logs or code.

| Variable | Set on | Meaning |
|---|---|---|
| `ALLOWED_ORIGINS` | every function | Same list as the `allowedOrigins` setting |
| `CORE_TABLE`, `CONTENT_TABLE`, `PROGRESS_TABLE`, `EVENTS_TABLE` | the functions that use that table | DynamoDB table names |
| `USER_POOL_ID` | `admin-api`, `class-api` | Cognito pool used to invite users and check groups |
| `PEPPER_SECRET_ARN` | `auth-student`, `class-api` | The address (not the value) of the secret used to hash student words |
| `APP_URL` | `class-api` | Address used for the links on login sheets (first non-localhost origin) |
| `ASSETS_BUCKET`, `ASSETS_URL` | `curriculum-api` | Where uploads go, and the public address that serves them |
| `BEDROCK_REGION`, `HINT_MODEL_ID`, `HINTS_MONTHLY_CAP`, `HINTS_PER_DAY` | `student-api` | Hint settings. `HINTS_PER_DAY` is fixed at 10 per student |

## Secrets

| Secret | Where | What it does |
|---|---|---|
| Credential pepper | AWS Secrets Manager, created by the Api stack | A random 48-character value mixed into the hash of every student's secret words. It is **retained** if the stack is deleted. Losing it signs every student out for good and invalidates all login sheets, so do not delete it |

The AI calls need no key. Lambda functions use their own AWS role, and each role names the models it may call.

Staff passwords are held by Cognito. API keys for CIC's dashboard are shown once and stored only as a hash.

## Fixed limits

These are in the code. Changing one means a code change and a deploy.

| Limit | Value |
|---|---|
| Student session | 8 hours. Closing the browser tab also ends it |
| Failed student logins | 10 wrong tries in 5 minutes pauses logins for that class code for 5 minutes |
| Hints per student | 10 a day |
| Hint log kept | 180 days |
| Audit log kept | 1 year |
| Lambda log retention | 14 days |
| Roster import | 500 students per file. Request bodies are capped at 256 KB |
| Image upload | 5 MB (PNG, JPEG or WebP) |
| PDF upload | 20 MB. Draft from a file accepts a PDF up to 4.5 MB |
| PowerPoint upload | 10 MB (`.pptx`) |
| Text taken from a deck for drafting | 60,000 characters |
| Draft job record | Expires after 24 hours |
| Read API groups | Any group with fewer than 5 students is returned with its numbers hidden |
| API rate limits | Default 50 requests per second, burst 100. Student login 5 per second. Read API 5 per second. Heartbeat 30 per second. Hints 10 per second. See [api.md](api.md#8-route-to-lambda-to-authorizer-map) |
| Code exercise run time | 5 seconds, with an output cap |
| Staff password | 12 or more characters with upper case, lower case and a digit |

## Where the settings live in the code

| Setting | File |
|---|---|
| Context keys and their checks | `backend/lib/config.ts` |
| Defaults in the repo | `backend/cdk.json` |
| Frontend variables | `frontend/app/config/env.ts` and `frontend/.env.example` |
| Per-function environment | `backend/lib/domains/*.ts` and `backend/lib/lambda-factory.ts` |
