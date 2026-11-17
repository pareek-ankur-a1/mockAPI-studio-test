# Backend guide

The backend manages accounts, project definitions, and mock records. It runs on Node.js and Express, stores data in MongoDB, and uses Redis for caching and rate limits. Brevo handles verification emails.

For installation, follow the [project README](../README.md). The default backend address is `http://localhost:5000`.

## Finding your way around

| Location | What it does |
|---|---|
| `src/index.js` | Connect dependencies, start the HTTP server, and handle shutdown |
| `src/app.js` | Set up middleware, shared services, routes, and error handling |
| `src/config` | MongoDB and Redis connections |
| `src/routes` | Map URLs to middleware and controllers |
| `src/controllers` | Handle requests and database operations |
| `src/models` | Define users, projects, resources, and mock records |
| `src/middleware` | Check authentication, validate payloads, and limit requests |
| `src/services/mockCache.js` | Cache mock responses and invalidate them after changes |
| `src/utils` | Schema validator, sample-data generator, OTP helpers, email, and prefixes |
| `test` | Automated tests and test helpers |

## Configuration

Copy `.env.example` to `.env` inside this folder and fill in your own values.

| Variable | Purpose | Default / requirement |
|---|---|---|
| `PORT` | HTTP port | `5000` |
| `NODE_ENV` | Runtime environment | Set `development` locally and `production` when deployed |
| `MONGO_URI` | MongoDB connection | Required |
| `REDIS_URL` | Redis connection | Required in production; optional in development |
| `REDIS_KEY_PREFIX` | Redis namespace | `mockapi:`; use a separate prefix per environment |
| `MOCK_CACHE_TTL_SECONDS` | Response-cache lifetime | `30`; accepts 1-3600 seconds |
| `TRUST_PROXY_HOPS` | Trusted reverse-proxy hops | `0`; match the actual deployment |
| `CLIENT_URL` | Allowed dashboard origin | `http://localhost:5173` |
| `JWT_SECRET` | Token-signing secret | Set a strong random value |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `BREVO_API_KEY` | Brevo HTTPS API key | Needed for email delivery |
| `EMAIL_FROM` | Verified sender address | Needed for email delivery |

Start the server from this folder with `npm run dev`, or use `npm start` without automatic restarts.

## Authentication

Registration creates an unverified account and returns a JWT. The server sends a six-digit email code, valid for ten minutes. Five incorrect submissions lock that code until a new one is requested.

Successful verification returns a replacement JWT containing `isVerified: true`. Login also returns a JWT with the user's current verification state.

Send tokens on protected requests like this:

```http
Authorization: Bearer <token>
```

| Method | Path | Body / behavior |
|---|---|---|
| POST | `/api/auth/register` | `{ name, email, password }`; creates an account |
| POST | `/api/auth/login` | `{ email, password }`; returns token and user |
| GET | `/api/auth/me` | Requires JWT; returns the current user from MongoDB |
| POST | `/api/auth/verify-email` | Requires JWT; accepts `{ otp }` as a six-character string |
| POST | `/api/auth/resend-otp` | Requires JWT; replaces the code and sends another email |

Passwords use bcrypt. OTP hashes are stored separately from the plaintext codes used in email. Registration keeps the account and token if email delivery fails and reports `emailSent: false`, allowing the user to resend.

`verifyJWT` checks token signature and expiry. `requireVerified` checks the token's verification claim. Neither is a replacement for the ownership checks performed by management controllers. There is no refresh-token or server-side logout/revocation flow.

## Project and resource management

All routes below start with `/api/internal`. They require a valid JWT, verified email, and ownership of the relevant project or resource.

| Method | Path | Purpose |
|---|---|---|
| GET | `/projects` | List your projects |
| POST | `/projects` | Create a project with `{ name, description }` |
| GET | `/projects/:projectId` | Get one project |
| DELETE | `/projects/:projectId` | Delete the project, its resources, and records |
| GET | `/projects/:projectId/resources` | List resources and record counts |
| POST | `/projects/:projectId/resources` | Create a resource |
| PUT | `/resources/:resourceId` | Update its schema or description |
| DELETE | `/resources/:resourceId` | Delete the resource and its records |
| POST | `/seed` | Generate records using `{ resourceId, count }` |

A resource creation body looks like this:

```json
{
  "resourceName": "products",
  "description": "Sample catalog",
  "schemaDefinition": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "price": { "type": "number", "minimum": 0 }
    },
    "required": ["title", "price"]
  }
}
```

Project prefixes are generated automatically and remain stable. Resource names use lowercase letters, digits, and separating hyphens. The same name can appear in different projects.

## Using mock endpoints

The base path for a resource is:

```text
/api/mock/:projectPrefix/:resourceName
```

For example: `/api/mock/proj_a1b2c/products`.

| Method | Path relative to the resource | Behavior |
|---|---|---|
| GET | `/` | List records, newest first |
| GET | `/:id` | Get a record by MongoDB ID |
| POST | `/` | Validate and create a record |
| PUT | `/:id` | Validate and replace the full payload |
| DELETE | `/:id` | Delete one record |
| DELETE | `/` | Delete all records, or only those matching the seeded filter |

POST and PUT bodies contain the record's fields directly, such as `{ "title": "Notebook", "price": 120 }`.

List requests accept `page` (default 1), `limit` (default 100, maximum 500), and optional `seeded=true` or `seeded=false`. Bulk deletion also accepts the seeded filter. List responses include `success`, pagination `meta`, and a `data` array. Returned records include `_id`, `_createdAt`, and `_isSeeded` metadata.

These routes are public and allow requests from any browser origin. Record operations are scoped to the resource named in the URL, but there is no user authentication on mock routes. PATCH is not implemented.

## Validation and sample data

Ajv checks resource schemas before they are saved and validates mock POST/PUT payloads against them. It collects field errors, applies schema defaults, and does not convert strings to numbers. Compiled validators are reused, then replaced when the current database schema differs.

Seeding accepts 1-500 records and uses Faker to generate values from declared properties. The mapper checks enum, const, the first anyOf/oneOf branch, name hints, format, and type in that order. Objects and arrays recurse with a depth limit.

Generated records are marked `isSeeded: true`. The response includes insertion statistics and up to five preview records. Partial bulk insert failures can return 207. Seeding does not run the generated payloads through Ajv, so complex constraints may not be satisfied.

## Redis behavior

Successful mock GET responses are cached for 30 seconds by default. Keys distinguish projects, resources, record IDs, pages, and filters. Errors and responses over 1 MiB are not cached.

`SET NX` initializes a shared project generation. Changes to records, resources, or schemas replace that generation; project/resource deletion and partial bulk changes also invalidate it. Earlier reads may populate old keys, but later requests use the new generation. Old keys expire automatically. The response cache has no custom Lua scripts.

`X-Cache` reports `HIT`, `MISS`, or `BYPASS`. Browser/proxy caching is disabled using `Cache-Control: no-store`, and cached requests still count toward quotas.

The rate limiter uses fixed windows starting with the first request. Its Redis adapter uses Lua internally for atomic counter updates.

| Operation | Limit | Counted by |
|---|---|---|
| Mock reads | 100/minute | IP |
| Mock writes/deletes | 60/minute | IP |
| Login | 20/15 minutes | IP |
| Registration | 5/15 minutes | IP |
| Verify code | 10/15 minutes | IP |
| Resend code | 3/15 minutes | IP |
| Seeding | 5/minute | User ID |

Public mock quotas are shared across projects for each IP. Without Redis in development, limits use local memory and response caching is disabled. If a Redis URL is configured, startup requires a working connection.

## Errors and health checks

Most responses include `success` and a `message` or `data`. Schema failures also include an `errors` array.

| Status | Meaning in this application |
|---|---|
| 400 | Invalid input or schema validation failure |
| 401 | Missing or invalid JWT, or incorrect login credentials |
| 403 | Unverified account, forbidden operation, or expired JWT |
| 404 | Route, project, resource, or record not found |
| 409 | Duplicate database value |
| 429 | Request quota exceeded or OTP attempt limit reached |
| 503 | Dependency unavailable, including email or Redis operations |
| 500 | Unexpected failure |

Cache lookup/storage failures can fall back to MongoDB. Rate-limit store failures block requests with 503. Invalidation failures also return 503, even if the database write succeeded; check the data before retrying.

`GET /health` reports process uptime and a timestamp. It does not query MongoDB or Redis. Development errors may include a stack trace.

## Tests

From this folder:

```sh
npm test
```

The default suite uses database and Redis test doubles and mocked email delivery. Set `REDIS_TEST_URL` to run the optional live Redis test against a test database. That test uses a unique key prefix and cleans up its own keys.

For deployment settings, see [DEPLOYMENT.md](../DEPLOYMENT.md). For the overall design, see [HIGH_LEVEL_DESIGN.md](../HIGH_LEVEL_DESIGN.md).
