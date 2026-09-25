# MockAPI Studio — Frontend Reference

React + Vite dashboard. Runs on port **5173** in development.

---

## Table of Contents

1. [Routing](#routing)
2. [Auth flow (client-side)](#auth-flow-client-side)
3. [AuthContext](#authcontext)
4. [API client](#api-client)
5. [Pages](#pages)
6. [Components](#components)
7. [Vite dev proxy](#vite-dev-proxy)
8. [Tailwind configuration](#tailwind-configuration)

---

## Routing

```
App.jsx
│
├── /login            → LoginPage          (public)
├── /register         → RegisterPage       (public)
├── /verify-email     → VerifyEmailPage    (JWT required, verification not required)
│
└── /*                → ProtectedRoute     (JWT + isVerified required)
     ├── /            → HomePage
     ├── /projects/:projectId → ProjectPage
     └── *            → redirect to /
```

### Route protection levels

| Route | Auth required | Verified required |
|-------|--------------|-------------------|
| `/login` | No | No |
| `/register` | No | No |
| `/verify-email` | **Yes (JWT)** | No |
| `/` and `/projects/*` | **Yes (JWT)** | **Yes** |

`ProtectedRoute` handles these checks in one component:
```
loading? → spinner
not authenticated? → /login
authenticated but !isVerified? → /verify-email
authenticated AND verified? → render children ✓
```

---

## Auth Flow (Client-side)

### After register / login

The server returns `{ token, user }`. The frontend calls `saveAuth(token, user)` which:
1. Writes `token` to `localStorage` under key `mockapi_token`
2. Writes `user` (JSON) to `localStorage` under key `mockapi_user`
3. Sets React state `user` and `token`

### On every page load

`AuthContext` runs `GET /api/auth/me` with the stored token on mount:
```
stored token exists?
  YES → GET /api/auth/me with Authorization: Bearer <token>
          OK → setUser(json.user), setToken(stored)
          FAIL → clearAuth() (wipes localStorage + state)
  NO  → setLoading(false) immediately
```

This means:
- A valid token → user stays logged in across browser refreshes
- An expired/tampered token → user is automatically logged out

### After OTP verification

The server issues a **new** JWT with `isVerified: true`. The frontend calls `saveAuth(newToken, newUser)` to replace the old token. The next `ProtectedRoute` check sees `isVerified: true` and allows dashboard access.

### Logout

`logout()` calls `clearAuth()` which removes both localStorage keys and resets state to `null`. The router then redirects to `/login`.

---

## AuthContext

**File:** `src/context/AuthContext.jsx`

```jsx
import { useAuth } from '../context/AuthContext.jsx';

const { user, token, loading, isAuthenticated, saveAuth, logout } = useAuth();
```

| Value | Type | Description |
|-------|------|-------------|
| `user` | object \| null | `{ _id, name, email, isVerified, createdAt }` |
| `token` | string \| null | Raw JWT string |
| `loading` | boolean | `true` while `/me` verification is in-flight |
| `isAuthenticated` | boolean | `!!user` shorthand |
| `saveAuth(token, user)` | function | Persist token + user to state + localStorage |
| `logout()` | function | Clear state + localStorage |

**Reading `isVerified`:**
```jsx
const { user } = useAuth();
if (!user.isVerified) {
  // redirect to /verify-email
}
```

---

## API Client

**File:** `src/api/client.js`

A typed fetch wrapper that **automatically injects `Authorization: Bearer <token>`** on every request by reading from `localStorage` on each call (not cached at module load time — so logout + re-login works correctly within the same tab).

### Usage

```js
import { api } from '../api/client.js';

// Projects
await api.projects.list()                       // GET /api/internal/projects
await api.projects.get(projectId)               // GET /api/internal/projects/:id
await api.projects.create({ name, description })// POST
await api.projects.delete(projectId)            // DELETE (cascade)

// Resources
await api.resources.list(projectId)             // GET + record counts
await api.resources.create(projectId, body)     // POST (schema validated)
await api.resources.update(resourceId, body)    // PUT (invalidates Ajv cache)
await api.resources.delete(resourceId)          // DELETE (cascade mockdata)

// Seeding
await api.seed(resourceId, 50)                  // POST /api/internal/seed

// Mock engine (no auth needed — open CORS)
await api.mock.getAll(prefix, resource, limit)  // GET /api/mock/:prefix/:resource
await api.mock.post(prefix, resource, body)     // POST
await api.mock.deleteAll(prefix, resource)      // DELETE all records
```

### Error handling

On non-2xx responses, the client throws an `Error` with:
- `.message` — the server's `message` field
- `.status` — HTTP status code
- `.details` — Ajv error array (if the server returned one)

```js
try {
  await api.resources.create(projectId, body);
} catch (err) {
  console.log(err.message);  // "resourceName and schemaDefinition are required."
  console.log(err.status);   // 400
  console.log(err.details);  // [{field: '/genre', message: '...'}] or null
}
```

---

## Pages

### `LoginPage` — `/login`

Email + password form. On success, calls `saveAuth()` and navigates to `/`.

If the returned `user.isVerified` is `false`, the router will immediately redirect to `/verify-email` because `ProtectedRoute` catches it.

---

### `RegisterPage` — `/register`

- Name, email, password, confirm password
- **Live password strength bar** (Weak / Good / Strong based on length)
- **Real-time confirm mismatch** — input border turns red if passwords don't match
- On success → navigates to `/verify-email` (token returned but `isVerified: false`)

---

### `VerifyEmailPage` — `/verify-email`

Six individual digit input boxes:
- **Auto-advance** — typing a digit moves focus to the next box
- **Backspace navigation** — pressing Backspace on empty box moves focus left
- **Arrow keys** — left/right navigate between boxes
- **Paste support** — pasting `"847293"` fills all boxes at once
- **60-second resend cooldown** — starts on page load (OTP was just sent during register)
- **Attempt feedback** — shows "3 attempts remaining" on wrong guess
- **Expired/Locked codes** — clears inputs and tells user to resend

On success, the new token (with `isVerified: true`) replaces the old one via `saveAuth()`.

---

### `HomePage` — `/`

Displays all of the user's projects in a responsive grid.

Features:
- **Loading skeleton** — 3 animated placeholder cards while fetching
- **Empty state** — with a CTA button when no projects exist
- **Hover-reveal delete** — delete button appears on card hover (with cascade warning)
- **Project card** shows: name, description, prefix badge, creation date, "Open →" link

---

### `ProjectPage` — `/projects/:projectId`

Displays all resources for a project.

Features:
- **Parallel data fetching** — `Promise.all([getProject, listResources])` on mount
- **Base URL hint** — shows the full mock URL pattern at the top
- **Record count summary** — "3 resources · 85 total records"
- **Empty state** with CTA
- **404 redirect** — if project not found or not owned, navigates back to `/`

---

## Components

### `Navbar`

Sticky dark top bar. Shows:
- MockAPI Studio logo (links to `/`)
- API Health indicator (links to `http://localhost:5000/health`)
- User **avatar** (initials from `user.name`, e.g. "RS" for "Riya Sharma")
- User name + email
- **Sign out** button → calls `logout()` → redirects to `/login`

---

### `ResourceCard`

One card per resource on `ProjectPage`. Contains:

**Header:**
- Resource name in monospace (`/products`)
- Record count badge (`20 records`)

**Schema pills:**
- Up to 5 property badges color-coded by type:
  - 🔵 `string`
  - 🟡 `number` / `integer`
  - 🟣 `boolean`
  - 🟢 `object`
  - 🔴 `array`

**⚡ Seed panel** (toggled by Seed button):
- Count input (1–500)
- Generate button → calls `POST /api/internal/seed`
- Preview of first 5 generated records shown inline

**Delete button** — confirmation dialog → cascade deletes resource + all its MockData

**EndpointSandbox** (always visible at the bottom)

---

### `EndpointSandbox`

```
┌─ GET ─ http://localhost:5000/api/mock/proj_m4x9z/movies ──────────────┐
│                                                   [Copy]  [Send]      │
└───────────────────────────────────────────────────────────────────────┘
                    ↓ after Send
┌─ 200 OK ─ 20 total records ────────────────── [Clear all records] ───┐
│ {                                                                     │
│   "success": true,                                                    │
│   "data": [ { "_id": "...", "title": "..." }, ... ]                  │
│ }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

- **Copy** → writes the full URL to clipboard, button text changes to "✓ Copied" for 2s
- **Send** → `GET /api/mock/{prefix}/{resource}?limit=10`, renders JSON inline
- **Clear all records** → `DELETE /api/mock/{prefix}/{resource}`, confirms first

---

### `CreateResourceModal`

Embedded Monaco Editor for JSON Schema input:

```
┌─● ● ●──── schema.json ──────────────────────────────────────────────┐
│ {                                                                    │
│   "type": "object",                                                  │
│   "properties": {                                                    │
│     "name": { "type": "string" },       ← autocomplete + highlight  │
│     "email": { "type": "string", "format": "email" }                │
│   },                                                                 │
│   "required": ["name"]                                              │
│ }                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

- `vs-dark` theme
- Minimap disabled
- Tab size: 2
- **"Reset to template"** link restores the default user schema example
- Resource name field auto-lowercases and strips invalid characters (`^[a-z0-9-]+$`)
- Server-side meta-schema validation errors surface inline below the editor

---

### `Modal`

Accessible base modal used by all dialog forms.

Behaviour:
- **Escape key** → close
- **Backdrop click** → close
- **Body scroll lock** → sets `body.overflow = 'hidden'` while open
- **Sizes**: `sm`, `md`, `lg`, `xl`
- Scrollable body if content is taller than 90vh

---

### `Toast` / `useToast`

Global notification system. Usage anywhere in the app:

```jsx
import { useToast } from '../components/shared/Toast.jsx';

const { toast } = useToast();
toast.success('Project created!');
toast.error('Something went wrong.');
toast.info('Loading your data...');
```

- Auto-dismisses after 3.5 seconds
- Stacks vertically (multiple toasts supported)
- Bottom-right fixed position
- Color-coded: green (success), red (error), blue (info)

---

### `Button`

```jsx
<Button variant="primary"   size="md" loading={false}>Submit</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="danger"    size="lg">Delete</Button>
<Button variant="ghost">Settings</Button>
```

| Prop | Values | Default |
|------|--------|---------|
| `variant` | `primary` `secondary` `danger` `ghost` | `primary` |
| `size` | `sm` `md` `lg` | `md` |
| `loading` | `boolean` | `false` |

When `loading={true}`, renders a spinning SVG and disables the button.

---

## Vite Dev Proxy

**File:** `vite.config.js`

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:5000',
      changeOrigin: true,
    }
  }
}
```

All `fetch('/api/...')` calls in the frontend are automatically proxied to the Express server during development. This means:
- No CORS issues with the internal API (dashboard CORS is `CLIENT_URL` restricted)
- You write relative paths (`/api/internal/projects`) not absolute URLs
- In production, both apps would be served from the same origin (no proxy needed)

The mock engine already has open CORS (`*`) so it could be called directly, but proxying keeps the codebase consistent.

---

## Tailwind Configuration

**Custom additions** in `tailwind.config.js`:

```js
colors: {
  brand: {
    50:  '#f0fdf4',   // lightest green tint
    100: '#dcfce7',
    500: '#22c55e',   // primary green
    600: '#16a34a',   // hover state
    700: '#15803d',   // active state
  }
}

animation: {
  'fade-in':  'fadeIn 0.2s ease-out',   // used by Modal overlay
  'slide-up': 'slideUp 0.25s ease-out', // used by Modal panel + Toast
}

fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
}
```

**Custom utility** in `index.css`:
```css
.custom-scrollbar  /* thin scrollbar for JSON preview areas */
```

## Production deployment

Set `VITE_API_ORIGIN` to the Render backend origin before building on Vercel.
`src/api/config.js` supplies all API URLs and public endpoint links. Leave it
blank locally to use the Vite proxy. `vercel.json` handles SPA route refreshes.
See [DEPLOYMENT.md](../DEPLOYMENT.md) for the full setup.
