# Deployment guide

This guide uses Vercel for the React frontend and Render for the Express backend, with MongoDB Atlas, Redis Cloud, and Brevo as external services. The project targets Node.js 24.

## Before you deploy

Make sure the app works locally, including registration and email verification. From the project root, run:

```sh
npm --prefix server test
npm --prefix client run build
```

Automated email tests use mocks. Register with an address you control to check actual email delivery.

Push the project to your Git repository, including package lockfiles and the `.env.example` files. Keep actual credentials in your hosting service's environment settings. Frontend `VITE_*` variables are included in the browser build, so they must not contain backend secrets.

## 1. Prepare the external services

You will need:

- A MongoDB database and connection string.
- A Redis database and connection URL. Use `rediss://` if TLS is required, and URL-encode special characters in the password.
- A Brevo API key and a verified sender address. The application sends email through Brevo's HTTPS API.

Allow the backend's outbound IP addresses in any network restrictions configured for these services. If Brevo's IP restrictions are enabled, include the backend's outbound addresses there too.

## 2. Deploy the backend on Render

Create a Node web service connected to the repository:

| Setting | Value |
|---|---|
| Root directory | `server` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |
| Node version | 24 |

Add these environment variables:

| Variable | What to set |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `MONGO_URI` | Your MongoDB connection string |
| `REDIS_URL` | Your Redis connection URL |
| `REDIS_KEY_PREFIX` | `mockapi:production:` |
| `MOCK_CACHE_TTL_SECONDS` | `30` |
| `JWT_SECRET` | A new random secret |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | Your frontend origin, with no trailing slash |
| `TRUST_PROXY_HOPS` | The number of trusted proxy hops in your deployment |
| `BREVO_API_KEY` | Your Brevo API key |
| `EMAIL_FROM` | Your verified sender address |

For a deployment with one trusted proxy hop, use `TRUST_PROXY_HOPS=1`. Check that requests from different networks are identified separately before relying on IP quotas.

Generate a JWT secret locally with:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

The server reads the port supplied by the host. Once deployed, open `https://YOUR-BACKEND.onrender.com/health`. A successful response confirms the HTTP process is running; it does not confirm email delivery or ongoing database readiness.

If you do not have a frontend URL yet, return to `CLIENT_URL` after the next step.

## 3. Deploy the frontend on Vercel

Import the same repository with these settings:

| Setting | Value |
|---|---|
| Root directory | `client` |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 24.x |

Set this variable before building:

```env
VITE_API_ORIGIN=https://YOUR-BACKEND.onrender.com
```

Use the backend origin without `/api` or a trailing slash. Changing this value requires rebuilding the frontend. The existing `client/vercel.json` rewrite supports direct visits and refreshes on React routes.

Copy the frontend's stable production origin into Render's `CLIENT_URL`, then redeploy the backend. Preview origins are not automatically allowed by the dashboard's CORS configuration.

## 4. Check the deployed app

- Register, receive the code, and verify your email.
- Log in and refresh the page.
- Create a project and resource, generate records, and try the copied endpoint.
- Repeat the same GET within the cache lifetime. Look for `X-Cache: MISS` followed by `HIT`.
- Change a record and check that the next read reflects the change.
- Confirm direct visits to `/login` and a project page load correctly.

Mock endpoints are public, including writes and deletes. Use disposable sample data.

## Common problems

| Symptom | What to check |
|---|---|
| Backend will not start | Deployment logs, `MONGO_URI`, `REDIS_URL`, and network access rules |
| Dashboard requests fail with CORS errors | `CLIENT_URL` matches the frontend's actual origin |
| Frontend calls localhost after deployment | Set `VITE_API_ORIGIN` and rebuild |
| Verification email does not arrive | Brevo key, verified sender, IP restrictions, sending quota, and spam folder |
| Requests unexpectedly return 429 | Quota usage and proxy settings; users may appear to share one IP |
| Write returns 503 | Redis may have failed during invalidation; read the data before retrying |
| First request after inactivity is slow | Check whether the host is waking an idle instance |

The [backend guide](server/README.md) explains environment variables and runtime behavior. For the overall structure, see [How MockAPI Studio works](HIGH_LEVEL_DESIGN.md).
