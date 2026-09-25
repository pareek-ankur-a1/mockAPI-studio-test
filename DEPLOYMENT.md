# Deploy with Vercel, Render, Redis Cloud and Brevo

The repository is configured for Node 24. Never commit `.env` files or place
backend secrets in Vercel's `VITE_*` variables.

## 1. Test locally

Set `BREVO_API_KEY` and `EMAIL_FROM` in `server/.env`; the sender must be verified
in Brevo. The app uses HTTPS email delivery, not SMTP. Authorize the public IP
of the machine running the backend in Brevo if IP blocking is enabled.

Run `npm test` in `server` and `npm run build` in `client`. Restart your local
backend, register using an email you control, and verify the received code.
Automated tests mock email delivery and do not send real emails.

## 2. Push the source to GitHub

Keep `client` and `server` together in one repository. Commit source files,
package manifests and lockfiles, `.node-version` files, `client/vercel.json`,
and `.env.example` templates. The root `.gitignore` excludes local credentials,
dependencies, and build output.

## 3. Create a Render Web Service

Connect the repository and configure:

| Setting | Value |
|---|---|
| Runtime | Node |
| Root directory | `server` |
| Build command | `npm ci` |
| Start command | `npm start` |
| Instance | Free |
| Health check | `/health` |

Set these environment variables in Render (not in committed files):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `MONGO_URI` | Atlas connection string |
| `REDIS_URL` | Redis Cloud connection string |
| `REDIS_KEY_PREFIX` | `mockapi:production:` |
| `MOCK_CACHE_TTL_SECONDS` | `30` |
| `JWT_SECRET` | New random secret |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | Final Vercel production origin, no trailing slash |
| `TRUST_PROXY_HOPS` | `1` for a single trusted proxy; verify client IP behavior |
| `BREVO_API_KEY` | Brevo API key (not SMTP key) |
| `EMAIL_FROM` | Verified Brevo sender address |

Generate a JWT secret locally with:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use the service's **Connect > Outbound** IP ranges in MongoDB Atlas Network
Access and Brevo Authorized IPs. Also configure any Redis IP restrictions.
Render supplies `PORT`; the server already uses it. Check the deployment logs
and open `https://YOUR-BACKEND.onrender.com/health`.

## 4. Create a Vercel project

Import the same repository using the Hobby plan for a personal project:

| Setting | Value |
|---|---|
| Root directory | `client` |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 24.x |

Set `VITE_API_ORIGIN=https://YOUR-BACKEND.onrender.com` before building.
Use only the origin, without `/api`. All frontend API requests and copied mock
URLs use this setting. Locally, leave it blank to use the Vite development proxy.
Vercel's SPA rewrite supports refreshes and direct visits on React Router paths.

Copy the stable frontend URL back into Render's `CLIENT_URL` and redeploy the
backend. Changing `VITE_API_ORIGIN` requires rebuilding the frontend. Preview
deployment origins are not automatically allowed by the backend's CORS policy.

## 5. Verify the deployment

Check registration/OTP delivery, verification, login, page refresh, project and
resource creation, copied endpoint URLs, `X-Cache: MISS` followed by `HIT`, write
invalidation, and `429` responses after exceeding the quota. Verify different
networks get separate rate-limit counters before relying on proxy settings.

Render's free backend can sleep after inactivity; open `/health` and wait for it
to wake before a demonstration. MongoDB and Redis remain external services.

References: [Render free services](https://render.com/docs/free),
[outbound IPs](https://render.com/docs/outbound-ip-addresses),
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[Brevo email API](https://developers.brevo.com/reference/send-transac-email).
