# MockAPI Studio

> A dynamic API mocking service — define JSON Schemas, get real HTTP endpoints, seed fake data, test instantly.

---

## What is MockAPI Studio?

MockAPI Studio lets frontend developers build and test their apps **without waiting for a real backend**. You define the shape of your data using JSON Schema, and the service instantly gives you a live REST endpoint — complete with validation, pagination, and faker-generated seed data.

**Real-world example:** You're building a movie booking app. Instead of waiting for a backend team, you:
1. Open the dashboard → Create a project → Get a prefix like `proj_m4x9z`
2. Create a `movies` resource with a JSON Schema defining `title`, `genre`, `duration`, etc.
3. Seed 50 fake movie records with one click
4. Call `GET http://localhost:5000/api/mock/proj_m4x9z/movies` from your app immediately
5. All your POSTs are validated against your schema — same as a real API would behave

---

## Feature Highlights

| Feature | Details |
|---------|---------|
| **Wildcard REST Endpoints** | Every resource gets `GET / GET:id / POST / PUT / DELETE` automatically |
| **JSON Schema Validation** | Powered by Ajv — POST/PUT bodies validated in real-time, 400 on failure |
| **Faker Data Seeding** | Seed up to 500 records per click using Faker.js with smart field name hints |
| **Monaco Editor** | Schema input with syntax highlighting and JSON autocomplete |
| **Multi-tenant Auth** | JWT + email OTP verification — each user only sees their own projects |
| **Open CORS on Mock Routes** | Call from any domain — your `localhost:3000`, staging, anywhere |
| **Rate Limiting** | 100 reads/min, 60 writes/min per IP — prevents abuse |
| **Redis** | Shared rate limits across servers and invalidated mock GET caches |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (React + Vite)                        │
│                                                                       │
│  /login  /register  /verify-email          /  /projects/:id          │
│  ────────────────────────────            ─────────────────────────   │
│  LoginPage  RegisterPage                 HomePage   ProjectPage       │
│  VerifyEmailPage                         ResourceCard  EndpointSandbox│
│                                                                       │
│  AuthContext (JWT in localStorage)                                    │
│  api/client.js (auto-injects Bearer token)                           │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTP (proxied by Vite dev server)
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js + Express)                         │
│                                                                       │
│  ┌─────────────┐  ┌──────────────────────┐  ┌────────────────────┐  │
│  │ /api/auth/* │  │  /api/internal/*     │  │  /api/mock/*       │  │
│  │  (public)   │  │  verifyJWT           │  │  open CORS (*)     │  │
│  │             │  │  requireVerified     │  │  rate limiter      │  │
│  │  register   │  │  ─────────────────── │  │  ──────────────    │  │
│  │  login      │  │  Projects CRUD       │  │  GET (paginated)   │  │
│  │  verify-OTP │  │  Resources CRUD      │  │  GET :id           │  │
│  │  resend-OTP │  │  Faker seed          │  │  POST → Ajv →save  │  │
│  │  /me        │  │                      │  │  PUT  → Ajv →save  │  │
│  └─────────────┘  └──────────────────────┘  │  DELETE            │  │
│                                              └────────────────────┘  │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      MongoDB (Atlas)                             │ │
│  │                                                                  │ │
│  │  users ──── projects ──── resources ──── mockdata               │ │
│  │             (prefix)      (schema JSON)  (Mixed data)           │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend
| Library | Version | Purpose |
|---------|---------|---------|
| Node.js | 24 | Runtime |
| Express.js | ^4.21 | HTTP framework |
| Mongoose | ^8.9 | MongoDB ODM |
| Ajv | ^8.17 | JSON Schema validation |
| @faker-js/faker | ^10.6 | Fake data generation |
| bcryptjs | ^2.4 | Password hashing |
| jsonwebtoken | ^9 | JWT signing/verification |
| Native fetch + Brevo | HTTPS API | Email / OTP delivery |
| express-rate-limit | ^7.5 | Rate limiting |
| cors | ^2.8 | CORS headers |

### Frontend
| Library | Version | Purpose |
|---------|---------|---------|
| React | ^18.3 | UI framework |
| Vite | ^6 | Build tool & dev server |
| React Router | ^7 | Client-side routing |
| Tailwind CSS | ^3.4 | Utility-first styling |
| @monaco-editor/react | ^4.6 | Code editor for JSON Schema |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel frontend, Render backend,
Redis Cloud, MongoDB Atlas, and Brevo setup.

## Quick Start

### Prerequisites
- Node.js 24
- A free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster

### 1. Clone & install

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Configure the backend

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/mock-api-service?retryWrites=true&w=majority
CLIENT_URL=http://localhost:5173
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=7d

# Email — Brevo API key and verified sender
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=your_verified_sender@example.com
```

### 3. Configure Redis Cloud and start both servers

Set your Redis Cloud connection URL in `server/.env`:

```env
REDIS_URL=redis://default:URL_ENCODED_PASSWORD@YOUR_REDIS_HOST:YOUR_REDIS_PORT
```

Use the database username, password, public hostname, and port from your Redis
Cloud console. URL-encode special characters in the password and use `rediss://`
if TLS is enabled for the database. Redis is required in production; leaving the URL
blank in development keeps local rate limits and disables response caching.

```bash
# Terminal 1 — Backend (http://localhost:5000)
cd server && npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd client && npm run dev
```

### 4. (Optional) Seed demo data

```bash
cd server && node seed-demo.mjs
```

Creates an "E-commerce Demo" project with products, users, and orders pre-seeded.

---

## Project Structure

```
Project/
├── server/                    ← Express backend
│   ├── src/
│   │   ├── app.js             ← Express factory (middleware + routes)
│   │   ├── index.js           ← HTTP server entry + graceful shutdown
│   │   ├── config/
│   │   │   └── db.js          ← Mongoose connection
│   │   ├── models/
│   │   │   ├── User.js        ← email, passwordHash, isVerified, OTP fields
│   │   │   ├── Project.js     ← name, prefix (proj_XXXXX), owner
│   │   │   ├── Resource.js    ← projectId, resourceName, schemaDefinition (Mixed)
│   │   │   └── MockData.js    ← resourceId, data (Mixed), isSeeded
│   │   ├── controllers/
│   │   │   ├── authController.js      ← register, login, verifyEmail, resendOtp, getMe
│   │   │   ├── mockController.js      ← getAllMockData, getSingleMockData,
│   │   │   │                            createMockData, updateMockData,
│   │   │   │                            deleteSingleMockData, deleteAllMockData
│   │   │   ├── internalController.js  ← Projects + Resources CRUD (ownership-scoped)
│   │   │   └── seedController.js      ← Faker bulk seeding
│   │   ├── middleware/
│   │   │   ├── auth.js           ← verifyJWT, requireVerified
│   │   │   ├── validateSchema.js ← Ajv validation for mock POST/PUT
│   │   │   └── rateLimiter.js    ← mockReadLimiter, mockWriteLimiter
│   │   ├── routes/
│   │   │   ├── auth.js      ← /api/auth/*
│   │   │   ├── internal.js  ← /api/internal/*
│   │   │   └── mock.js      ← /api/mock/:prefix/:resource[/:id]
│   │   └── utils/
│   │       ├── ajvInstance.js   ← Singleton Ajv + schema cache
│   │       ├── emailService.js  ← Brevo HTTPS email API
│   │       ├── fakerMapper.js   ← JSON Schema → Faker field generator
│   │       ├── generatePrefix.js← proj_XXXXX generator
│   │       └── otpHelper.js     ← generateOTP, hashOTP, verifyOTP
│   ├── seed-demo.mjs          ← One-shot demo data seeder
│   ├── .env                   ← Your local secrets (git-ignored)
│   └── .env.example           ← Template
│
└── client/                    ← React frontend
    ├── src/
    │   ├── App.jsx            ← Routes + providers
    │   ├── main.jsx           ← React root
    │   ├── index.css          ← Tailwind directives
    │   ├── api/
    │   │   └── client.js      ← Typed fetch wrapper (auto-injects JWT)
    │   ├── context/
    │   │   └── AuthContext.jsx← user, token, saveAuth, logout
    │   ├── components/
    │   │   ├── layout/Navbar.jsx             ← Logo + user avatar + sign out
    │   │   ├── shared/
    │   │   │   ├── Button.jsx                ← 4 variants + loading spinner
    │   │   │   ├── Modal.jsx                 ← Accessible (Esc, backdrop)
    │   │   │   ├── Toast.jsx                 ← useToast hook + provider
    │   │   │   └── ProtectedRoute.jsx        ← Auth + verified guard
    │   │   ├── projects/CreateProjectModal.jsx
    │   │   ├── resources/
    │   │   │   ├── CreateResourceModal.jsx   ← Monaco editor embedded
    │   │   │   └── ResourceCard.jsx          ← Schema pills + seed panel
    │   │   └── sandbox/EndpointSandbox.jsx   ← URL + copy + live GET
    │   └── pages/
    │       ├── LoginPage.jsx
    │       ├── RegisterPage.jsx              ← Password strength bar
    │       ├── VerifyEmailPage.jsx           ← 6-digit OTP input
    │       ├── HomePage.jsx                  ← Project grid
    │       └── ProjectPage.jsx               ← Resources list
    ├── vite.config.js         ← Dev proxy /api → :5000
    └── tailwind.config.js
```

---

## Complete Documentation Suite

- **Backend Reference & API Docs:** [`server/README.md`](./server/README.md) — Middleware pipeline, Mongoose models, Auth/OTP routes, Internal CRUD routes, Wildcard Mock Engine routes, Ajv caching, and Faker seeding priority.
- **Frontend Reference & Component Guide:** [`client/README.md`](./client/README.md) — Client routing, `ProtectedRoute` levels, `AuthContext` lifecycle, typed API client, page flows, UI components, and Vite proxy setup.

---

## How the Mock Engine Works

When you send `POST /api/mock/proj_m4x9z/movies`:

```
Request arrives
      │
      ▼
cors({ origin: '*' })          ← Open to all origins
      │
      ▼
mockWriteLimiter               ← 60 req/min per IP
      │
      ▼
validateSchema middleware
  ├── Extract projectPrefix + resourceName from URL params
  ├── Look up Project by prefix → 404 if not found
  ├── Look up Resource by (projectId, resourceName) → 404 if not found
  ├── Check Ajv cache: ajv.getSchema(resource._id)
  │     ├── Cache hit  → use cached compiled validator (fast)
  │     └── Cache miss → compile schema, cache it, use it
  ├── Run validator against req.body
  │     ├── Invalid → return 400 with Ajv error array
  │     └── Valid   → attach req.resource, call next()
      │
      ▼
createMockData controller
  ├── Read req.resource (set by middleware — no duplicate DB lookup)
  ├── Create MockData document: { resourceId, data: req.body, isSeeded: false }
  └── Return 201 with the saved document
```

---

## How Auth + OTP Works

```
Register (POST /api/auth/register)
  ├── Validate name/email/password
  ├── bcrypt.hash(password, 12)
  ├── User.create({ isVerified: false })
  ├── crypto.randomInt(100000, 1000000) → OTP string
  ├── SHA-256 hash → stored in user.otpHash
  ├── otpExpiresAt = now + 10 minutes
  ├── sendOtpEmail() → Brevo HTTPS API
  └── Return JWT { isVerified: false } + user

Verify Email (POST /api/auth/verify-email) [JWT required]
  ├── Fetch user + hidden OTP fields
  ├── Check: otpHash exists? not expired? attempts < 5?
  ├── Hash submitted OTP with SHA-256, compare
  │     ├── Mismatch → increment attempts, return 400 + attempts remaining
  │     ├── Expired  → return 400 code: OTP_EXPIRED
  │     └── Match    → clear OTP fields, isVerified = true
  └── Return NEW JWT { isVerified: true } + user

Login (POST /api/auth/login)
  ├── findOne by email (+ select passwordHash)
  ├── bcrypt.compare(password, hash) — timing-safe
  └── Return JWT with current isVerified value from DB

Every protected request (/api/internal/*)
  ├── verifyJWT → decode token → req.user = { userId, email, isVerified }
  ├── requireVerified → 403 if !isVerified
  └── Controller runs with req.user.userId scoping all DB queries
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: 5000) |
| `NODE_ENV` | No | `development` or `production` |
| `MONGO_URI` | **Yes** | MongoDB Atlas connection string |
| `REDIS_URL` | In production | Redis connection URL; blank in development disables caching and uses memory rate limits |
| `REDIS_KEY_PREFIX` | No | Shared namespace for replicas (default: `mockapi:`); use a different prefix per environment |
| `MOCK_CACHE_TTL_SECONDS` | No | Mock GET cache lifetime, 1–3600 seconds (default: 30) |
| `TRUST_PROXY_HOPS` | No | Known reverse-proxy hop count (default: 0); configure accurately for IP rate limits |
| `CLIENT_URL` | No | Dashboard origin for CORS (default: `http://localhost:5173`) |
| `JWT_SECRET` | **Yes** | Random 64-byte hex string for signing JWTs |
| `JWT_EXPIRES_IN` | No | Token lifetime (default: `7d`) |
| `BREVO_API_KEY` | For OTP delivery | Brevo API key |
| `EMAIL_FROM` | For OTP delivery | Verified Brevo sender address |

---

## Redis caching and rate limiting

Successful mock list and single-record GET responses are cached in Redis. Cache
keys separate projects, resources, record IDs, pagination, and seeded filters.
`X-Cache` is `HIT`, `MISS`, or `BYPASS`. Entries expire after 30 seconds by default;
responses larger than 1 MiB bypass caching. Browsers receive `Cache-Control:
no-store` so they always contact the server and count toward rate limits.

Mock writes, seeding, schema changes, and resource/project deletion invalidate
all mock responses for the affected project. Shared random generation tokens
make old entries unreachable without scanning Redis, and a Lua check prevents
an earlier read from restoring stale cache entries after a write. Old entries
expire naturally. Partial bulk writes also invalidate the cache. A read already
in flight during a write may return its earlier database snapshot.

Rate limits use Redis when configured, with separate counters for each policy:

| Operation | Limit | Key |
|-----------|-------|-----|
| Mock GET | 100/minute | IP |
| Mock POST/PUT/DELETE | 60/minute | IP |
| Login | 20/15 minutes | IP |
| Registration | 5/15 minutes | IP |
| OTP verification | 10/15 minutes | IP |
| OTP resend | 3/15 minutes | IP |
| Seeding | 5/minute | Authenticated user |

These are fixed windows starting with the first request. Rejections return
`429`, rate-limit headers, and `Retry-After`. Cached GETs consume the read limit.
Do not enable proxy trust without matching your deployment's network path.

When Redis is configured, startup requires a connection. At runtime, cache read
errors fall back to MongoDB, but a rate-limit store error returns `503` rather
than accepting unmetered traffic. A failed post-write invalidation also returns
`503`; the database may already have changed, so read the result before retrying.
Any remaining stale cache entries expire at their TTL. Redis reconnects after
runtime disconnects. Configure your Redis database with `noeviction` so rate-limit
counters are not evicted to make room for responses. Monitor memory usage;
with this policy, a full Redis instance rejects new writes.

Run backend tests from `server`:

```bash
npm test
```

The default suite uses database and Redis test doubles and sends local HTTP
requests. To also exercise actual Redis Lua scripts and counters using the Redis
Cloud URL already configured in `server/.env`, run from `server` in PowerShell
(Node.js 20.6 or newer):

```powershell
node --env-file=.env --input-type=module -e "process.env.REDIS_TEST_URL = process.env.REDIS_URL; await import('./test/redis.live.test.js');"
```

The live test uses a unique namespace and removes only its own keys. It is
skipped when `REDIS_TEST_URL` is unset. No MongoDB connection or email delivery
is needed for these tests.

## License

MIT
