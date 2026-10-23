# Setup, verification and design decision

## Clean checkout

Use Node.js 22 and npm. No external database or compiler is required.

```sh
git clone https://github.com/amenallah5577/project-restaurant.git
cd project-restaurant
npm ci
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` in a POSIX shell). Replace `JWT_SECRET` with a random secret and choose `ADMIN_EMAIL`/`ADMIN_PASSWORD` before the first startup. Leave SMTP_USER and SMTP_PASS blank to keep email in mock mode. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and save it locally.

```sh
npm run check
npm test
npm start
```

Open `http://localhost:3000/` for the dining site and `/index.html` for admin login. `/api/health` should return JSON with `status: ok`; `/api/menu` should contain seeded items. First startup creates `data/project_restaurant.db`, schema, menu and the configured administrator. Changing the seed password environment variable later does not change an existing account: use the authenticated password-change endpoint. Never remove a real database just to reset credentials.

Submit a reservation locally, log in to the admin panel, confirm it and verify its status. Use fictional addresses with mock email. There are no customer accounts: all reservation records are private to administrators. Public users can submit a booking, but cannot retrieve, list, update or delete reservations. The six automated integration tests cover this boundary, successful persistence/status changes, invalid fields, invalid status, bad logins, tampered/expired tokens and protected menu mutations. They use real Express routes, an isolated in-memory sql.js database and no SMTP delivery.

## Deployment scope

The checked-in Netlify configuration publishes static HTML only. Its `/api/health` returned 404 on 23 October 2026, so that deployment is not a working reservation service. A failed request now displays "Reservation not sent" instead of a fake success. To run the full application, host this Node process with a persistent writable data directory and serve the frontend and API at the same origin (or explicitly configure a proxy). Do not advertise a functioning booking demo until create/login/confirm has been verified against that deployment.

## Decision: sql.js file persistence

**Decision:** use an in-process SQLite database via sql.js and periodically export it to a local file. **Alternative:** a managed PostgreSQL service or native SQLite with durable transactions. **Benefit:** portable Windows-friendly installation, SQL querying and a working demo without an external database. **Cost:** the complete database is held in memory and exported synchronously; a crash can lose changes since the last export, and multiple server processes can overwrite each other's snapshots. It is unsuitable for ephemeral serverless filesystems or horizontal scaling. Keep a single process and persistent disk for this demo; move to a transactional external database before operating real reservations at scale.

## Verification record

On 23 October 2026, a fresh clone installed with `npm ci`; six integration tests and syntax checks passed. The HTTP test starts an actual loopback server on a random port. Public deployment health failed as described above. SMTP delivery and a persistent production deployment were not verified.
