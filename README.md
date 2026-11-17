# MockAPI Studio

MockAPI Studio lets you create mock REST APIs for frontend development. You define a resource using JSON Schema, add some sample data, and use its endpoint in your application while the real backend is being built.

For example, you can create a `products` resource, generate sample products, and use them to build a catalog page.

## Features

- Create projects and resources from a dashboard.
- Read, create, update, and delete mock records.
- Validate POST and PUT requests against your resource's schema.
- Generate up to 500 sample records at a time using Faker.
- Test endpoints from the dashboard.
- Register and log in with email verification.
- Cache mock GET responses and share rate-limit counters using Redis.

## Built with

React, Vite, and Tailwind CSS on the frontend. Node.js, Express, MongoDB, and Redis on the backend. Ajv handles schema validation, Faker generates sample data, and Brevo sends verification emails.

## Run locally

You need Node.js 24, a MongoDB database, and a Brevo API key with a verified sender to complete email verification. Redis is optional in development and required in production.

Run these commands from the project root:

```sh
npm install --prefix server
npm install --prefix client
```

Copy `server/.env.example` to `server/.env`. In PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Set these values in `server/.env`:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_random_secret
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=your_verified_sender_email
REDIS_URL=
```

You can generate a JWT secret with:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add your Redis connection URL to enable caching and shared rate limits. If you leave it blank in development, reads go directly to MongoDB and rate limits use local memory. The other settings can keep their development defaults.

Start the backend:

```sh
npm --prefix server run dev
```

In a second terminal, start the frontend:

```sh
npm --prefix client run dev
```

Open [localhost:5173](http://localhost:5173). The backend runs on port 5000, and Vite forwards local `/api` requests to it.

## Try it

1. Register and verify your email.
2. Create a project and a resource called `products`.
3. Give the resource a schema, for example:

```json
{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "price": { "type": "number", "minimum": 0 }
  },
  "required": ["title", "price"]
}
```

4. Generate some sample records and copy the endpoint from the dashboard.
5. Call it from your app:

```js
// Replace proj_abc12 with your project's prefix.
const response = await fetch('http://localhost:5000/api/mock/proj_abc12/products');
const result = await response.json();
console.log(result.data);
```

Mock endpoints support GET, POST, PUT, and DELETE. List requests accept `page`, `limit`, and `seeded` query parameters. PUT replaces the full record payload.

Project management requires a verified account. Mock endpoints are public, including writes and deletes, so use sample data rather than private information. Faker supports common schema fields but does not guarantee every generated value satisfies every schema constraint.

## Tests

```sh
npm --prefix server test
```

The default tests use database and Redis test doubles and mock email delivery. The live Redis test runs only when `REDIS_TEST_URL` is set.

## More details

- [High-level design](HIGH_LEVEL_DESIGN.md)
- [Deployment instructions](DEPLOYMENT.md)
- [Backend documentation](server/README.md)
- [Frontend documentation](client/README.md)
