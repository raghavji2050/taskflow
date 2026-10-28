# TaskFlow - Full-Stack To-Do List Application

A professional task management application built with Next.js App Router, TypeScript, Tailwind CSS, MySQL, Prisma ORM, and NextAuth.js.

## Features

### Core
- User registration, login, logout (credentials + Google/GitHub OAuth)
- Protected dashboard with middleware
- Full CRUD for tasks with pagination
- Priority (Low, Medium, High) and status (Pending, In Progress, Completed)
- Due dates with time support and overdue indicators
- Search, filter, sort, and archive tasks
- Dashboard stats with breakdown chart and completion ring
- Keyboard shortcuts: `N` new task, `/` focus search, `Esc` close modal

### Organization
- Categories with sidebar navigation
- Tags on tasks
- Kanban board view (drag between columns)
- Calendar view by due date
- Bulk select: complete, archive, delete

### Account & Security
- Profile settings (edit name, change password)
- Forgot / reset password with email
- Email verification on register
- Rate limiting on auth routes
- OAuth (Google, GitHub) when configured

### Rich Tasks
- Subtasks / checklist
- Recurring tasks (daily, weekly, monthly)
- Task activity log
- File attachments (local upload)
- Comments on tasks
- Custom task ordering

### Notifications
- In-app notification center
- Due date reminders
- Push notifications (Firebase Cloud Messaging + service worker)
- Email digests via cron job

### Collaboration
- Workspaces with member invites
- Task assignment support
- Export / import tasks (JSON)
- Public share links for categories
- Admin panel for user management
- SSE real-time events endpoint

### DevOps
- Vitest unit tests
- Playwright E2E tests
- GitHub Actions CI
- Docker + docker-compose
- Sentry error monitoring (optional)
- OpenAPI spec at `/api/openapi`

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | MySQL |
| ORM | Prisma |
| Auth | NextAuth.js (Credentials + OAuth + JWT) |
| Email | Nodemailer |
| Push | Firebase Cloud Messaging |
| Drag & Drop | @dnd-kit |
| Testing | Vitest + Playwright |

## Installation

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

For push notifications, create a Firebase project with Cloud Messaging enabled, add a web app,
generate a Web Push certificate (VAPID key) under Cloud Messaging, and a service account key.
Fill in the `NEXT_PUBLIC_FIREBASE_*` and `FIREBASE_*` variables from `.env.example`.
Users must re-enable notifications once after upgrading from the old Web Push setup.

### 3. Start MySQL (Docker option)
```bash
docker-compose up mysql -d
```

### 4. Run migrations and seed
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### 5. Start dev server
```bash
npm run dev
```

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| demo@todo.app | password123 | User |
| admin@todo.app | password123 | Admin |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright) |
| `npm run db:migrate` | Run migrations |
| `npm run db:seed` | Seed demo data |

## Scheduled maintenance (Vercel Cron)

Hobby allows two cron jobs, each once per day. `vercel.json` registers both. Vercel invokes them with `Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` in the Vercel project environment variables (see `.env.example`); the routes return 401 without it. Schedules are UTC.

| Path | Schedule | Work |
|------|----------|------|
| `GET /api/cron/trash` | `30 3 * * *` (03:30) | Hard-deletes tasks and projects whose Trash `deletedAt` is older than 30 days, in batches. Tasks that belong to an expired project are removed first (`projectId` is `ON DELETE SET NULL`). Child rows cascade. |
| `GET /api/cron/reminders` | `0 8 * * *` (08:00) | Sends task reminders a user set (`remindAt` reached, `sent` still false) and archives completed tasks from before today. Also runs the existing daily digest and due-date automations. |

Repeating either job is safe for purge, reminder delivery, and archive: purged rows are gone, reminders are marked `sent`, and archived tasks stay archived. A second run the same day can send the digest email again.

These routes exist but are not on the Hobby schedule:

- `GET /api/cron/timer-reminders` needs an hourly check while a timer is running. A daily tick would miss that window.
- `GET /api/cron/scheduled-messages` delivers chat messages on the minute. Local `npm run dev` still runs that job. A daily cron would send them late.

## API Documentation

- Interactive docs: [http://localhost:3000/docs](http://localhost:3000/docs)
- OpenAPI JSON: [http://localhost:3000/api/openapi](http://localhost:3000/api/openapi)
- Full reference: [docs/API.md](docs/API.md)

## Docker

```bash
docker-compose up --build
```

## License

MIT
