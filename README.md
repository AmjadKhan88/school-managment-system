# School ERP

Monorepo: `apps/api` (Express + TypeScript + Prisma + PostgreSQL) and `apps/web` (React + TypeScript + Tailwind).

## Quick start

```bash
# 1. Install everything (run at repo root)
npm install

# 2. Start PostgreSQL (or point DATABASE_URL at your own server)
npm run db:up

# 3. Configure environment
cp apps/api/.env.example apps/api/.env      # then replace both JWT secrets
cp apps/web/.env.example apps/web/.env

# 4. Generate Prisma client, create tables, seed roles + first admin
npm run db:generate -w apps/api
npm run db:migrate  -w apps/api -- --name init
npm run db:seed

# 5. Run both apps
npm run dev          # web: http://localhost:5173   api: http://localhost:5000/api/v1
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `apps/api/.env`, then change the password.

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | API and web together |
| `npm run typecheck` | Type-check both apps |
| `npm test` | API tests (Vitest + Supertest) |
| `npm run build` | Production builds |
| `npm run db:studio -w apps/api` | Browse the database |

## Conventions
- Every API route: `authenticate` -> `authorize(module, action)` -> `validate(zodSchema)` -> controller -> service.
- Every query is tenant-scoped: `where: { ...tenant(req) }`.
- Money columns: `@db.Decimal(14, 2)`. Never floats.
- Financial records are never deleted; reverse with a new entry and write an audit log.
- New module = new folder in `apps/api/src/modules/<name>/` with `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts`, registered in `src/routes.ts`.
