# AI Receptionist (Local)

Local, free version of the Reliable Shop Systems AI receptionist. No Replit, no cloud servers, no hosted database — everything runs on this machine. The only external service is the OpenAI API (used for the AI's reasoning; small per-call cost).

Based on the design in `../../ai assistent phone/ai_receptionist_implementation_pack.md`:
same database schema (translated to SQLite), same API endpoints, same prompt layers, same call-routing rules and guardrails.

## Requirements

- Node.js 18+ (https://nodejs.org)
- An OpenAI API key (https://platform.openai.com/api-keys)
- A bearer token for the management API (`AI_API_BEARER_TOKEN`)

## Setup

```bash
cd "programs/ai-receptionist"
npm install
copy .env.example .env
```

Edit `.env` and set `OPENAI_API_KEY` and `AI_API_BEARER_TOKEN`. Adjust shop name, address, and policies there too.

Security note: `AI_API_BEARER_TOKEN` is required and must not be a placeholder value (for example, `change-me`). Use a long random token.

## Run

```bash
npm run dev
```

Open http://localhost:3000 — enter a caller phone number and start a simulated call.

The database is a single file at `data/receptionist.db` (created automatically). Every call, customer, vehicle, appointment, callback task, AI action, and guardrail event is stored there.

## What it does

- Answers like a receptionist: intake of name, callback number, vehicle, problem, drivable, shop vs mobile, preferred time.
- Auto-books only approved services (oil change, battery, brake inspection, AC check, check-engine diagnostic) after checking real availability against shop hours and existing appointments.
- Complex estimates, job status, warranty/insurance, complaints → callback task for staff (never auto-booked).
- Urgent cases (unsafe breakdown, overheating, tow needed, engine knock) → immediate escalation + urgent callback task; booking is blocked in code, not just by prompt.
- It has no tools for invoices, estimates, work orders, refunds, or discounts — those actions are structurally impossible for the AI.

## API

The management API from the original design is available at `/api/ai/*` (policy, customer lookup/create, vehicles, calls, transcripts, appointment requests, availability, appointments, callback tasks, interaction logs).

All `/api/ai/*` endpoints now require an Authorization header:

```bash
Authorization: Bearer <AI_API_BEARER_TOKEN>
```

Appointment creation via `/api/ai/appointments` is restricted to approved auto-book services from business rules, consistent with the AI tool flow.

### Authenticated API example script

PowerShell example calls (always sends the bearer header):

```powershell
Set-Location "programs/ai-receptionist"
$env:AI_API_BEARER_TOKEN = "your-real-token"
./scripts/ai-api-examples.ps1
```

### Auth + guardrail smoke test

With the server running, execute:

```powershell
Set-Location "programs/ai-receptionist"
$env:AI_API_BEARER_TOKEN = "your-real-token"
npm run test:auth-smoke
```

This verifies:
- Missing bearer token returns 401
- Invalid bearer token returns 403
- Disallowed service booking is blocked with 403
- Allowed service booking succeeds with 201 after creating test customer and vehicle
- Matching guardrail audit events are recorded in SQLite

### Integration API test

With the server running, execute:

```powershell
Set-Location "programs/ai-receptionist"
$env:AI_API_BEARER_TOKEN = "your-real-token"
npm run test:integration
```

This verifies key endpoint contracts (status codes and response shape) across policy, lookup, customer, vehicle, availability, and appointment flows.

### CI gate

A GitHub Actions workflow runs build + smoke + integration tests on push and pull requests affecting this project.

Required repository secret:
- `AI_API_BEARER_TOKEN`

### Branch protection (require CI before merge)

After this project is pushed to GitHub, apply branch protection so merges require the CI job to pass.

Prerequisites:
- Repository exists on GitHub
- GitHub CLI authenticated (`gh auth login`)
- Workflow [.github/workflows/ai-receptionist-ci.yml](.github/workflows/ai-receptionist-ci.yml) is present on default branch

Run:

```powershell
Set-Location "programs/ai-receptionist"
./scripts/set-branch-protection.ps1 -Owner "YOUR_GITHUB_OWNER" -Repo "YOUR_REPO_NAME" -Branch "main"
```

This enforces:
- Pull request required before merge
- 1 approving review required
- Stale review dismissal on new commits
- Conversation resolution required
- Linear history required
- No force-push
- No branch deletion
- Required status check context: `test` (from CI workflow job)

## Adding a real phone number later

See `src/routes/telephony.ts`. Point a telephony provider's inbound-call webhook (Twilio, Telnyx, or a SIP trunk) at this server and feed transcribed speech into the same engine the chat UI uses. The core logic does not change.
