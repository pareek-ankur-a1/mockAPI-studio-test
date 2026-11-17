# Frontend guide

The React dashboard lets users manage projects, define resource schemas, generate sample data, and try mock endpoints. It uses Vite, React Router, Tailwind CSS, and Monaco for the schema editor.

For the full project setup, start with the [README](../README.md).

## Run the dashboard

From this folder:

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The backend normally runs on port 5000. Vite forwards `/api` requests to that backend during development.

Leave `VITE_API_ORIGIN` blank locally. For a deployed frontend, set it to the backend origin before building:

```env
VITE_API_ORIGIN=https://YOUR-BACKEND.onrender.com
```

Do not include `/api` or a trailing slash. This is a public build-time setting; changing it requires rebuilding.

## Pages

| Route | What you can do |
|---|---|
| `/register` | Create an account |
| `/login` | Sign in |
| `/verify-email` | Submit the email code or request another one |
| `/` | View, create, and delete your projects |
| `/projects/:projectId` | Manage resources, generate records, and try endpoints |

The dashboard requires login and verified email. `ProtectedRoute` shows a loading state while the session is checked, sends logged-out users to `/login`, and sends unverified users to `/verify-email`. The verification page sends already-verified users back to the dashboard; submitting or resending a code requires a valid token on the backend.

These browser checks guide navigation. The backend separately verifies tokens and ownership before allowing management operations.

## Login state

`src/context/AuthContext.jsx` stores the user and token in React state and localStorage:

- `mockapi_token` holds the JWT.
- `mockapi_user` holds the user profile.

On page load, it sends the stored token to `/api/auth/me`. If that succeeds, it loads the current profile. If it fails, it clears the session. After email verification, it saves the replacement token returned by the server.

Components can access the shared state through `useAuth()`:

```jsx
const { user, loading, saveAuth, logout } = useAuth();
```

Logout clears local state and storage. It does not revoke the token on the backend.

## Calling the API

`src/api/config.js` builds backend URLs. `src/api/client.js` wraps management requests and reads the latest token from localStorage for each call.

```js
import { api } from '../api/client.js';

const projects = await api.projects.list();
await api.projects.create({ name: 'Store demo' });
await api.seed(resourceId, 20);
```

The management wrapper attaches `Authorization: Bearer <token>`. On a failed response, it throws an error with `message`, `status`, and optional validation `details`.

The `api.mock` helpers call the public endpoints without authentication. Those helpers return parsed JSON directly, so callers need to handle unsuccessful API responses too.

## Where to make changes

| Location | Purpose |
|---|---|
| `index.html` | Vite's HTML entry point; loads `src/main.jsx` |
| `src/main.jsx` | Mount React and set up the browser router |
| `src/App.jsx` | Define routes and shared providers |
| `src/pages` | Login, registration, verification, project list, and project details |
| `src/components/projects` | Project creation form |
| `src/components/resources` | Resource cards, schema editor, and seeding controls |
| `src/components/sandbox` | Copy endpoint URLs, send GET requests, and clear records |
| `src/components/shared` | Buttons, modals, notifications, and protected routes |
| `src/components/layout` | Navigation bar |
| `src/context` | Shared authentication state |
| `src/api` | API requests and backend URL configuration |
| `src/index.css` and `tailwind.config.js` | Styles, colors, fonts, and animations |

Resource creation uses Monaco to edit JSON Schema. Resource cards show field summaries and sample-data controls. The endpoint sandbox displays the response from a public mock URL. Deleting a project or resource also deletes its stored mock records.

## Build and deploy

```sh
npm run build
npm run preview
```

The build is written to `dist`. Preview serves that build locally and inherits this project's API proxy configuration. When hosting the frontend separately from the backend, set `VITE_API_ORIGIN` before building.

On Vercel, `vercel.json` sends route requests to `index.html` so refreshing a project page works. The backend's `CLIENT_URL` must match the deployed dashboard origin. See the [deployment guide](../DEPLOYMENT.md).

## If something is not working

| Problem | First thing to check |
|---|---|
| The root URL returns 404 | Start Vite from `client` and make sure `index.html` exists |
| API requests fail locally | Check the backend is listening on port 5000 |
| Login disappears after a refresh | Inspect the `/api/auth/me` request and backend availability |
| Dashboard redirects to verification | Complete email verification and save the new token |
| Deployed app still calls localhost | Set `VITE_API_ORIGIN` and rebuild |
| Direct project URL returns 404 in hosting | Check the SPA rewrite is included |

The [backend guide](../server/README.md) lists endpoints and validation rules.
