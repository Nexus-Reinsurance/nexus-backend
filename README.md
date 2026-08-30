# Nexus Backend API

Backend service for **Nexus: Reinsurance Treaty Renewal Decision-Support Dashboard**.

This project provides a Node.js and Express REST API connected to PostgreSQL. It supports a Phase 2 proof of concept (PoC) for demo-user authentication, dashboard metrics, treaty retrieval, and cedent information retrieval.

> **Phase 2 security note:** The current login flow is intentionally limited to the academic PoC. It verifies that a registered demo-user email exists, then returns a JWT. The current `app_user` table does not contain a password field or a password hash. Do not use this email-only authentication flow with real users or confidential data. Password-based authentication with `password_hash` and bcrypt verification is planned for Phase 3.

## Features

- PostgreSQL connection pooling through `pg`
- Environment-based database configuration with `dotenv`
- Express REST API
- CORS-enabled frontend access during development
- JWT generation on successful demo login
- JWT middleware protecting dashboard and treaty routes
- Dashboard metrics from the `treaty` table
- Treaty list and treaty-detail endpoints
- Treaty queries joined with cedent information
- API health-check endpoint

## Project structure

```text
server/
├── config/
│   └── database.js          # PostgreSQL pool configuration
├── middleware/
│   └── auth.js              # JWT verification middleware
├── routes/
│   ├── auth.js              # Login endpoint
│   ├── dashboard.js         # Dashboard metrics endpoint
│   └── treaties.js          # Treaty list/detail endpoints
├── .env                     # Local secrets; do not commit
├── .env.example             # Safe environment-variable template
├── .gitignore
├── index.js                 # Express application entry point
├── package.json
├── package-lock.json
└── test.js                  # Basic API test script
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
cd server
```
### 2. Install Node.js packages

```bash
npm install
```

If required packages are missing, install them:

```bash
npm install express cors dotenv pg jsonwebtoken axios
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
| `axios` | Used by `test.js` to test API endpoints |
| `nodemon` | Restarts the development server when files change |

### 3. Create your environment file

Create a file named `.env` in the `server` folder:

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
JWT_EXPIRE=30d
```

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

### Data-model notes

The current Phase 2 schema stores the following values directly on each treaty:

- Earned premium: `treaty.earned_premium`
- Claims incurred: `treaty.claims_incurred`
- Renewal date: `treaty.treaty_renewal_date`
- Loss-ratio support field: `treaty.loss_ratio`
- Risk-classification support field: `treaty.risk_level`
- Recommendation support field: `treaty.recommendation`

The schema does not yet include separate `premium`, `claim`, or `renewal` tables. If the project later needs multiple reporting periods or detailed transaction histories per treaty, those tables can be added in Phase 3.

## Create a demo user

The current Phase 2 login checks for a registered email address. Add a controlled demo user before testing the login endpoint.

Connect to PostgreSQL:

```bash
psql -U nexus_user -d nexus -h localhost
```
Insert the demo user. The UUID is generated automatically, so do not manually type one:

```sql
INSERT INTO app_user (first_name, last_name, email, role)
VALUES (
    'Demo',
    'User',
    'demo@nexus.com',
    'admin'
);
```

Verify it exists:

```sql
SELECT user_id, first_name, last_name, email, role
FROM app_user;
```

Exit PostgreSQL:

```sql
\q
```

If the email already exists, do not run the insert again. You can verify it with:

```sql
SELECT user_id, email, role
FROM app_user
WHERE email = 'demo@nexus.com';
```
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



### `GET /api/health`

Public endpoint used to verify that the Express API is running.

## Run API tests

Ensure the backend is running in one terminal:

```bash
npm run dev
```

In a separate terminal, still inside the `server` folder, run:

```bash
npm test
```

The test script performs the following sequence:

Expected output is similar to:

```text
🧪 Testing Login...
✅ Login successful

🧪 Testing Dashboard...
✅ Dashboard metrics: { ... }

🧪 Testing Treaties List...
✅ Treaties count: 0

✅ All tests passed!
```

A treaty count of `0` is valid if the database has not yet been populated with treaties.


## License

Academic project / course submission. Add the team’s selected license if the repository will be shared publicly.