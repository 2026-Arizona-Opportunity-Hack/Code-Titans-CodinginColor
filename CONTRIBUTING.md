# Contributing

How to change CIC Learn without breaking it. Set the project up first with [docs/setup.md](docs/setup.md). The reasons behind the design are in [docs/decisions.md](docs/decisions.md).

## Ground rules

- **One repository.** All code for this project lives here. Do not start a second repo.
- **Small pull requests into `main`.** One change per PR, ideally under 400 changed lines. Do not stack PRs on top of other feature branches: a stack merged in the wrong order once left parts of the API missing from `main` (see decision 15).
- **No secrets in Git.** Never commit `.env` files, keys, tokens or passwords. Use `.env.example` with placeholders. `.gitignore` already excludes `.env*` except the example.
- **No student data in logs, tests or screenshots.** Use placeholders such as `[email]`. Log IDs and counts only.
- **The server decides.** Anything that grades, unlocks, or checks who may see something happens in a Lambda. The browser only displays.

## Workflow

```bash
git checkout main && git pull
git checkout -b feat/short-name           # or fix/..., docs/...
# make the change, run the checks below
git commit -m "Explain why, in the imperative"
git push -u origin feat/short-name
gh pr create                              # fills in the template
```

Pull request format (the template is in `.github/pull_request_template.md`):

- **Title:** imperative, under 72 characters. `Add roster merge`, not `Updates`.
- **Description:** under 500 words. What changed, why, how to test it, and screenshots for anything visual.
- Link the issue it closes (`Closes #12`).

Do not force-push a shared branch.

## Checks before you push

```bash
# Backend
cd backend
npm test                                          # CDK assertions
python3 -m pytest test -q -p no:cacheprovider     # Lambda tests (needs: pip install -r requirements-dev.txt)
npx tsc --noEmit

# Frontend
cd ../frontend
npm run lint
npx tsc --noEmit
```

All of these run without AWS access. A change is not done until they pass.

## Where things go

| You are changing | Put it in |
|---|---|
| An API endpoint | The Lambda's `ROUTES` in `backend/lambda/<name>/`, the matching route list in `backend/lib/domains/`, tests under `backend/test/`, and the row in [docs/api.md](docs/api.md) |
| A rule that several Lambdas share (authorization, gain, grading, validation) | `backend/lambda/shared-layer/python/cic/` |
| Infrastructure | `backend/lib/`. Define everything in CDK. Do not configure AWS by hand |
| A screen | `frontend/app/<route>/page.tsx` and components in `frontend/app/components/<feature>/` |
| A call to the API | One typed function in `frontend/app/lib/api/` |
| A new setting | `backend/lib/config.ts` (with a check) or `frontend/app/config/env.ts`, plus [docs/configuration.md](docs/configuration.md) and `.env.example` |

Adding an endpoint, step by step: see "Adding an endpoint" in [backend/README.md](backend/README.md).

## Backend rules

- **Python 3.12.** Follow PEP 8 and use type hints on function signatures.
- **Keep handlers thin.** `index.py` routes the request. Rules live in modules next to it or in the shared layer.
- **Authorize inside the handler** with `cic.authz`, using the identity the authorizer verified. Never take "who is calling" from the request body or path.
- **Validate input at the edge** with `cic.validate`, and reject fields you do not expect.
- **Log IDs and counts only.** Use `cic.log`. Do not log names, emails, tokens, class codes, secret words or answers.
- **Least privilege.** Give each function only the table access it needs, through CDK grant methods. Name resources instead of using `*`. Never use `Action: "*"`.
- **No third-party Python packages** without a strong reason. The code uses the standard library and boto3.
- **Write the test with the change.** Lambda tests use moto and the real handlers. For each permission rule, add a test for the case that must be refused (a teacher opening another class, a student reading another student, a reviewer reading student data).

## Frontend rules

- **Next.js App Router, TypeScript strict, Tailwind.** Prefer `interface` for object shapes. Export types next to the components that use them.
- **Static export.** Pages with an ID take it from the query string (`?id=`), because the site is a folder of static files with no server.
- **Never put a secret in a `NEXT_PUBLIC_` variable.** Everything with that prefix is public.
- **Render text as text.** Never inject author or student content as HTML.
- **Accessibility is a requirement.** Use real buttons, links and labels. Keep focus visible, support the keyboard, never rely on colour alone, announce status changes, and respect reduced motion. Run an axe-core scan on a screen you add or change.
- **Handle loading, empty and error states** on every screen that calls the API. Use plain words in messages.

## Docs

Keep these in step with the code in the same PR:

| If you changed | Update |
|---|---|
| An endpoint | [docs/api.md](docs/api.md) |
| A rule, role or data shape | [docs/architecture.md](docs/architecture.md) |
| A setting | [docs/configuration.md](docs/configuration.md) and `.env.example` |
| A deploy or recovery step | [docs/operations.md](docs/operations.md) or [docs/setup.md](docs/setup.md) |
| A user-visible screen or flow | [docs/user-guide.md](docs/user-guide.md), and the README screenshots if the screen shows there |
| A choice someone may question later | A new entry in [docs/decisions.md](docs/decisions.md): what you decided, why, what you turned down |

Docs describe what is built. Do not list built features as "next steps", and do not describe planned work as done.

## Reporting a problem

Open a GitHub issue with what you did, what you expected and what happened. Do not paste secrets, student names or login words into an issue.
