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
- Push notifications (Web Push + service worker)
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
| Push | web-push |
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
