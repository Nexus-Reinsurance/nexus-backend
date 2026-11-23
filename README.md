# Nexus Backend API

Backend service for **Nexus: Reinsurance Treaty Renewal Decision-Support Dashboard**.

This project provides a Node.js and Express REST API connected to PostgreSQL. It provides password login, dashboard metrics, treaty retrieval and creation, cedent information, and renewal-decision recording.

> **Security note:** Login requires an email and a password. The password is checked against a bcrypt hash in `app_user.password_hash`; plain-text passwords are never stored. This is still an academic prototype: there is no user registration, password reset, role-based authorization, or rate limiting, so do not use it with real users or confidential data.

## Features

- PostgreSQL connection pooling through `pg`
- Environment-based database configuration with `dotenv`
- Express REST API
- CORS limited to the frontend dev origin (`http://localhost:3000`); the frontend normally reaches the API through its Vite proxy
- JSON error responses (`{ success: false, message }`) for validation errors, unknown routes, malformed JSON, and server errors
- Re-runnable seed script (`npm run seed`) with renewal dates relative to today
- Loss ratio, risk level, and an explained recommendation calculated by `lib/treatyRules.js` whenever the seed or an import writes a treaty
- Import of real public data: 508 treaties from the CAS Loss Reserving Database (`npm run import:cas`, see [Datasets](#datasets))
- Email and password login checked with bcrypt, returning a JWT
- JWT middleware protecting dashboard and treaty routes
- Dashboard metrics from the `treaty` table
- Treaty list, treaty-detail, and create-treaty endpoints
- Renewal decisions (`renew`, `review`, `reprice`, `escalate`) recorded per treaty and user, with full history
- Treaty queries joined with cedent information
- API health-check endpoint

## Project structure

```text
nexus-backend/
├── config/
│   ├── database.js          # PostgreSQL pool configuration
│   └── seed.js              # Demo data: npm run seed
├── lib/
│   ├── treatyRules.js       # Loss ratio, risk level, recommendation
│   ├── treatyRules.test.js  # Unit tests: npm run test:unit
│   └── treatyStore.js       # Shared cedent/treaty writes used by seed and import
├── middleware/
│   └── auth.js              # JWT verification middleware
├── routes/
│   ├── auth.js              # Login endpoint
│   ├── cedents.js           # Cedent list endpoint
│   ├── dashboard.js         # Dashboard metrics endpoint
│   └── treaties.js          # Treaty list/detail/create and decision endpoints
├── scripts/
│   └── import-cas.js        # CAS dataset import: npm run import:cas
├── .env                     # Local secrets; do not commit
├── .env.example             # Safe environment-variable template
├── .gitignore
├── index.js                 # Express application entry point
├── package.json
├── package-lock.json
└── test.js                  # API integration tests: npm test
```
## Prerequisites

Install the following before running the backend:

- Node.js and npm
- PostgreSQL
- A PostgreSQL database named `nexus`
- A PostgreSQL role/user with access to the `nexus` database

Check your installed versions:

```bash
node --version
npm --version
psql --version
```

## Installation

### 1. Open the backend folder

```bash
cd nexus-backend
```
### 2. Install Node.js packages

```bash
npm install
```

If required packages are missing, install them:

```bash
npm install express cors dotenv pg jsonwebtoken bcryptjs
npm install --save-dev nodemon
```

The backend relies on the following main packages:

| Package | Purpose |
|---|---|
| `express` | REST API server and routing |
| `pg` | PostgreSQL connection pool and queries |
| `dotenv` | Loads values from `.env` |
| `cors` | Allows browser frontend requests during development |
| `jsonwebtoken` | Creates and verifies JWTs |
| `bcryptjs` | Hashes and checks passwords |
| `nodemon` | Restarts the development server when files change |

### 3. Create your environment file

Create a file named `.env` in the `nexus-backend` folder:

```bash
cp .env.example .env
```

If `.env.example` does not exist yet, create `.env` manually.

Use this local-development example and replace values where necessary:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexus
DB_USER=nexus_user
DB_PASSWORD=your_postgresql_password
PORT=5000
NODE_ENV=development
JWT_SECRET=replace_this_with_a_long_random_secret
JWT_EXPIRE=1d
DEMO_PASSWORD=choose_a_demo_password
```

`JWT_EXPIRE` is optional and defaults to `1d`. `DEMO_PASSWORD` is the password `npm run seed` gives `demo@nexus.com` and `npm test` logs in with.

Do not commit `.env` to GitHub. It contains database credentials and your JWT signing secret.

### 4. Create the database and user

If your group has already created the shared local database and role, skip this step and use the team-provided credentials.

Otherwise, open PostgreSQL as an administrator and create a database user and database:

```sql
CREATE USER nexus_user WITH PASSWORD 'your_postgresql_password';
CREATE DATABASE nexus OWNER nexus_user;
```

Then connect to the database:

```bash
psql -U nexus_user -d nexus -h localhost
```
## Database schema

Nexus currently uses PostgreSQL with the following four implemented tables:

- `cedent`
- `app_user`
- `treaty`
- `decision`

Run the following SQL against the `nexus` database if the schema has not already been created by your team:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE cedent (
    cedent_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(150) NOT NULL,
    region        VARCHAR(100),
    email         VARCHAR(255),
    phone_number  VARCHAR(50)
);

CREATE TABLE app_user (
    user_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    role        VARCHAR(50) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),  -- bcrypt hash; a user without one cannot log in
    last_login  TIMESTAMP
);
CREATE TABLE treaty (
    treaty_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedent_id             UUID NOT NULL REFERENCES cedent(cedent_id),
    name                  VARCHAR(150) NOT NULL,
    treaty_code           VARCHAR(20) NOT NULL UNIQUE,
    treaty_type           VARCHAR(50) NOT NULL,
    business_line         VARCHAR(100) NOT NULL,
    earned_premium        NUMERIC(14,2) NOT NULL,
    claims_incurred       NUMERIC(14,2) NOT NULL DEFAULT 0,
    loss_ratio            NUMERIC(6,4),
    risk_level            VARCHAR(10) CHECK (risk_level IN ('Low', 'Medium', 'High')),
    recommendation        VARCHAR(255),
    treaty_effective_date DATE NOT NULL,
    treaty_renewal_date   DATE NOT NULL,
    treaty_status         VARCHAR(20) NOT NULL DEFAULT 'active',
    treaty_created_on     TIMESTAMP NOT NULL DEFAULT now(),
    treaty_updated        TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE decision (
    decision_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treaty_id      UUID NOT NULL REFERENCES treaty(treaty_id),
    user_id        UUID NOT NULL REFERENCES app_user(user_id),
    action         VARCHAR(20) NOT NULL CHECK (action IN ('renew', 'review', 'reprice', 'escalate')),
    decision_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    created_on     TIMESTAMP NOT NULL DEFAULT now(),
    notes          TEXT
);

CREATE INDEX idx_treaty_cedent_id
    ON treaty(cedent_id);

CREATE INDEX idx_treaty_renewal_date
    ON treaty(treaty_renewal_date);
CREATE INDEX idx_treaty_risk_level
    ON treaty(risk_level);

CREATE INDEX idx_decision_treaty_id
    ON decision(treaty_id);

CREATE INDEX idx_decision_user_id
    ON decision(user_id);
```

**Upgrading a database created before password login:** add the column, then re-run the seed to give the demo user a password:

```sql
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
```

### Data-model notes

The current Phase 2 schema stores the following values directly on each treaty:

- Earned premium: `treaty.earned_premium`
- Claims incurred: `treaty.claims_incurred`
- Renewal date: `treaty.treaty_renewal_date`
- Loss-ratio support field: `treaty.loss_ratio`
- Risk-classification support field: `treaty.risk_level`
- Recommendation support field: `treaty.recommendation`

`loss_ratio`, `risk_level`, and `recommendation` are never typed in. `lib/treatyStore.js` derives them from premium and claims through `lib/treatyRules.js` on every write:

| Loss ratio (claims ÷ earned premium) | Risk level | Recommendation starts with |
|---|---|---|
| 80% or more | High | Reprice or escalate |
| 60% to under 80% | Medium | Review terms |
| under 60% | Low | Renew |

The recommendation also states the loss ratio and the threshold that triggered it. The ratio is rounded to 4 decimals (the column's precision) before it is classified. The 80% and 60% thresholds are project assumptions from Phase 1, not real underwriting rules.

The schema does not yet include separate `premium`, `claim`, or `renewal` tables. If the project later needs multiple reporting periods or detailed transaction histories per treaty, those tables can be added in Phase 3.

## Create a demo user

Login needs a user with a bcrypt password hash, so create the demo user with the seed script rather than by hand. Set `DEMO_PASSWORD` in `.env` first, then run:

```bash
npm run seed
```

It creates `demo@nexus.com` with that password, three cedents, and four treaties whose renewal dates are relative to today. It is safe to re-run: the demo user's password is reset to `DEMO_PASSWORD`, existing cedents are reused, and the four demo treaties are reset.

## Local database instance (optional)

Instead of a database in the system PostgreSQL, you can run a private PostgreSQL cluster owned by your own user (no `sudo` needed). One is expected at `../.nexus-db/data`, outside both repositories (set `NEXUS_PGDATA` to use another folder), listening on `localhost:5433`:

```bash
npm run db:start    # after every reboot; it does not start on its own
npm run db:status
npm run db:stop
```

To create one: `initdb -D ../.nexus-db/data -U nexus_user -W -A scram-sha-256`, add `port = 5433`, `listen_addresses = 'localhost'` and `unix_socket_directories = ''` to its `postgresql.conf`, run `npm run db:start` and `createdb -h localhost -p 5433 -U nexus_user nexus`, and set `DB_PORT=5433` and `DB_PASSWORD` in `.env`. Then apply the schema below, `npm run seed`, and optionally `npm run import:cas`. `initdb` is in `/usr/lib/postgresql/<version>/bin` on Ubuntu.

## Running the server

### Development mode

```bash
npm run dev
```

Expected output is similar to:

```text
✅ Server starting...
🚀 Nexus server running on http://localhost:5000
📊 Environment: development
```

If database logging is enabled in `config/database.js`, you may also see a PostgreSQL connection message.

## API endpoints

Every route except `/api/health` and `/api/auth/login` needs `Authorization: Bearer <token>`. Successful responses are `{ success: true, ... }`, and errors are `{ success: false, message }`.

| Method and path | Body | Response |
|---|---|---|
| `GET /api/health` | | `{ status: 'ok' }`. Public |
| `POST /api/auth/login` | `{ email, password }` | `user` and `token`. 400 if either field is missing, 401 if they don't match |
| `GET /api/dashboard/metrics` | | `metrics` |
| `GET /api/cedents` | | `cedents` (`cedent_id`, `name`, `region`, `email`), sorted by name |
| `GET /api/treaties` | | `treaties`, each joined with its cedent |
| `POST /api/treaties` | See below | 201 with `treaty`. 400 for an invalid field or unknown cedent, 409 if `treaty_code` is taken |
| `GET /api/treaties/:id` | | `treaty`. 400 for a non-UUID ID, 404 if unknown |
| `GET /api/treaties/:id/decisions` | | `decisions`, newest first, each with `user_name`. 404 if the treaty is unknown |
| `POST /api/treaties/:id/decisions` | `{ action, notes? }` | 201 with `decision`. `action` is `renew`, `review`, `reprice` or `escalate`. The user comes from the token |

`POST /api/treaties` takes `cedent_id` (an existing cedent), `treaty_code` (unique, up to 20 characters), `name`, `treaty_type` (`Quota Share`, `Excess of Loss`, `Stop Loss` or `Surplus`), `business_line`, `earned_premium` (a number above 0), `claims_incurred` (a number, 0 or more), and `treaty_effective_date` and `treaty_renewal_date` (`YYYY-MM-DD`, renewal after effective). New treaties are `active`. `loss_ratio`, `risk_level` and `recommendation` are always calculated, never sent.

## Run API tests

```bash
npm test
```

The tests start the app inside the test process, so no server needs to be running. They use the database in `.env`, which needs the schema, `DEMO_PASSWORD`, and `npm run seed`. They check:

1. Login: the right password returns a JWT. A missing field (400), a wrong password or unknown email (401), and malformed JSON (400) are rejected, and do not update `last_login`.
2. Missing or invalid tokens (401) and unknown routes (404).
3. Dashboard metrics against the same sums in SQL.
4. Treaty list and detail, including non-UUID (400) and unknown (404) IDs.
5. Creating a treaty and its calculated loss ratio, risk and recommendation, plus a taken code (409) and invalid fields (400).
6. Recording decisions and reading the history back newest first, plus invalid actions (400) and unknown treaties (404).

They write one `TEST-<timestamp>` treaty with two decisions and delete both at the end. Node's test runner lists each test and exits with code 1 if any fails.


## Run unit tests

```bash
npm run test:unit
```

Checks the loss-ratio, risk, and recommendation rules in `lib/treatyRules.js`, including the 60% and 80% boundaries, with Node's built-in test runner. It needs no database or running server.

## Datasets

### Demo seed

`npm run seed` creates four hand-made treaties (`TR-001` to `TR-004`) for quick demos.

### CAS Loss Reserving Database (real public data)

```bash
npm run import:cas                  # downloads the pinned copy (about 3 MB)
npm run import:cas -- ./clrd.csv    # or reads a local copy
```

This loads **508 treaties from 273 US insurers** (120 High, 216 Medium, 172 Low risk). It runs in one transaction and is safe to re-run: cedents are reused by name, treaties are updated by `treaty_code`, and renewal dates are refreshed.

**Source.** Meyers, G. and Shi, P., *Loss Reserving Data Pulled From NAIC Schedule P*, Casualty Actuarial Society: <https://www.casact.org/publications-research/research/research-resources/loss-reserving-data-pulled-naic-schedule-p>. The import reads the CSV copy (`clrd.csv`) in the [chainladder-python](https://github.com/casact/chainladder-python) repository (MPL-2.0), pinned to commit `46727b1`. 

**What the file contains.** Net earned premium and incurred losses (including IBNR) for 379 US insurer groups, six lines of business, accident years 1988 to 1997, as known at the end of 1997. Amounts are USD thousands; the import converts them to USD.

**How it maps to Nexus.** One treaty per insurer and line of business, using the five accident years 1993 to 1997 as evaluated at the end of 1997. Books under $1M of premium are dropped.

| Nexus column | Value | Real or assigned |
|---|---|---|
| `cedent.name` | Insurer group name | Real |
| `cedent.region`, `cedent.email` | `Americas`; `reinsurance@<name>.example` (a reserved domain, so it never reaches anyone) | Assigned |
| `treaty.treaty_code` | `CAS-<group code>-<line>` | Derived |
| `treaty.business_line` | Personal Auto, Commercial Auto, Workers' Compensation, Medical Malpractice, Product Liability, Other Liability | Real |
| `treaty.treaty_type` | Quota Share for the two auto lines, Excess of Loss for the rest | Assigned |
| `treaty.name` | `<business line> <treaty type>` | Derived |
| `earned_premium`, `claims_incurred` | Five-year sums | Real |
| `loss_ratio`, `risk_level`, `recommendation` | `lib/treatyRules.js` | Calculated |
| Renewal and effective dates | Renewal spread over the next 365 days (fixed per treaty); effective date one year earlier | Assigned |

Premiums are each insurer's whole net book (the subject premium), not a reinsurer's share. Loss ratios are unaffected.

**Removing the data.**

```sql
DELETE FROM treaty WHERE treaty_code LIKE 'CAS-%';
DELETE FROM cedent c WHERE c.email LIKE '%.example'
  AND NOT EXISTS (SELECT 1 FROM treaty t WHERE t.cedent_id = c.cedent_id);
```

The first statement fails if decisions have been recorded against CAS treaties; delete those decisions first.

## License

Academic project / course submission. Add the team’s selected license if the repository will be shared publicly.
