# Backend

CDK (TypeScript) app plus Python 3.12 Lambdas for the curriculum platform. Design: [`../docs/architecture.md`](../docs/architecture.md). API contract: [`../docs/api.md`](../docs/api.md).

## Layout

| Path | Purpose |
|---|---|
| `bin/app.ts` | CDK entry point. Stacks: `CicCurriculumDataStack`, `...AuthStack`, `...ApiStack` |
| `lib/` | Stacks, config, Lambda factory |
| `lib/domains/` | One construct per API domain. Add a domain here, then add one line to `ApiStack` |
| `lambda/<name>/index.py` | One Lambda per directory (kebab-case) with `lambda_handler` |
| `lambda/shared-layer/python/cic/` | Shared code (Lambda layer): http, errors, authz, db, logging |
| `test/` | Mirrors the source layout. `*.test.ts` run with jest, `test_*.py` with pytest |

## Commands

```bash
npm install
npm test            # CDK assertion tests (no AWS access needed)
pip install -r requirements-dev.txt   # once, in a venv
npm run test:py     # Lambda unit tests (uses moto, no AWS access needed)
npx tsc --noEmit    # type check
```

## Deploying

Use the shared hackathon AWS profile (`export AWS_PROFILE=hackathon`). The account also holds other projects, so all stack names start with `CicCurriculum`. Tables and the user pool use `RETAIN`, so deleting a stack leaves them behind on purpose.

```bash
npx cdk diff            # review first
npx cdk deploy --all    # only when the team agrees
```

Deployment settings come from CDK context (`cdk.json` or `-c key=value`): `allowedOrigins` (required, comma-separated, never `*`) and `staffMfa` (`REQUIRED` or `OPTIONAL`).

## Adding an endpoint

1. Add the function to the Lambda's `ROUTES` dict. The key is the API Gateway route key, for example `"GET /v1/classes/{classId}/progress"`.
2. Add the same route key to the domain construct's route list in `lib/domains/`.
3. Authorize inside the handler with `cic.authz` (never trust IDs from the request for who the caller is).

## Frontend hosting

The frontend is a static export hosted on AWS Amplify (app `cic-curriculum`, `d3voqx7r17ipz6`, branch `main`,
us-west-2): https://main.d3voqx7r17ipz6.amplifyapp.com. Amplify adds HSTS, `X-Frame-Options: DENY`,
`nosniff` and a strict referrer policy. To publish a new build (no Git connection needed):

```bash
cd frontend && npm run build            # uses frontend/.env.local, so mocks must be off there
(cd out && zip -qr /tmp/site.zip .)
aws amplify create-deployment --app-id d3voqx7r17ipz6 --branch-name main   # returns jobId and zipUploadUrl
curl -X PUT -H "Content-Type: application/zip" --data-binary @/tmp/site.zip "<zipUploadUrl>"
aws amplify start-deployment --app-id d3voqx7r17ipz6 --branch-name main --job-id <jobId>
```

The hosted URL is listed first in `allowedOrigins` (`cdk.json`). That lets the browser call the API and
upload files to S3 from it, and makes it the link printed on student login sheets.

