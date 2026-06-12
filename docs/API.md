# API Documentation

Base URL: `http://localhost:3000`

All task endpoints require authentication via NextAuth session cookie.

## Authentication

### Register User

`POST /api/auth/register`

**Request Body**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (201)**
```json
{
  "message": "Account created successfully",
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com",
    "createdAt": "2026-06-11T10:00:00.000Z"
  }
}
```

**Error Responses**
- `400` - Validation error
- `409` - Email already exists

---

### Login User

`POST /api/auth/login`

**Request Body**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200)**
```json
{
  "message": "Login successful",
  "user": {
    "id": "clx...",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Responses**
- `400` - Validation error
- `401` - Invalid credentials

---

### NextAuth Session

`GET/POST /api/auth/[...nextauth]`

Handled by NextAuth.js for session management. After login, the client calls `signIn("credentials")` to create a session cookie.

---

## Tasks

### List Tasks

`GET /api/tasks`

**Query Parameters**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| search | string | - | Search in title and description |
| status | PENDING \| COMPLETED \| ALL | ALL | Filter by status |
| priority | LOW \| MEDIUM \| HIGH \| ALL | ALL | Filter by priority |
| sort | dueDate \| createdAt \| priority | dueDate | Sort field |
| order | asc \| desc | asc | Sort order |

**Success Response (200)**
```json
{
  "tasks": [
    {
      "id": "clx...",
      "title": "Complete project",
      "description": "Finish the todo app",
      "priority": "HIGH",
      "status": "PENDING",
      "dueDate": "2026-06-15T00:00:00.000Z",
      "userId": "clx...",
      "createdAt": "2026-06-11T10:00:00.000Z",
      "updatedAt": "2026-06-11T10:00:00.000Z"
    }
  ],
  "stats": {
    "total": 10,
    "completed": 4,
    "pending": 6,
    "highPriority": 2,
    "completionPercentage": 40,
    "breakdown": [],
    "recentTasks": []
  }
}
```

---

### Create Task

`POST /api/tasks`

**Request Body**
```json
{
  "title": "Complete project",
  "description": "Finish the todo app",
  "priority": "HIGH",
  "status": "PENDING",
  "dueDate": "2026-06-15"
}
```

**Success Response (201)**
```json
{
  "task": { "...": "..." }
}
```

---

### Get Task by ID

`GET /api/tasks/[id]`

**Success Response (200)**
```json
{
  "task": { "...": "..." }
}
```

**Error Responses**
- `404` - Task not found

---

### Update Task

`PUT /api/tasks/[id]`

**Request Body** (same as create)

**Success Response (200)**
```json
{
  "task": { "...": "..." }
}
```

---

### Delete Task

`DELETE /api/tasks/[id]`

**Success Response (200)**
```json
{
  "message": "Task deleted successfully"
}
```

---

## Error Format

All errors follow this structure:

```json
{
  "error": "Error message"
}
```

Common status codes:
- `400` - Bad request / validation error
- `401` - Unauthorized
- `404` - Resource not found
- `409` - Conflict
- `429` - Rate limited
- `500` - Internal server error

---

## Additional Endpoints (v2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/forgot-password` | Request password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| GET | `/api/auth/verify-email?token=` | Verify email address |
| PATCH | `/api/tasks/[id]` | Archive/unarchive task |
| POST | `/api/tasks/bulk` | Bulk complete/archive/delete |
| GET | `/api/tasks/export` | Export all tasks as JSON |
| POST | `/api/tasks/import` | Import tasks from JSON |
| PUT | `/api/tasks/reorder` | Reorder tasks by position |
| GET/POST | `/api/categories` | List/create categories |
| POST | `/api/categories/[id]` | Generate share link |
| GET/POST | `/api/tags` | List/create tags |
| GET/POST | `/api/tasks/[id]/subtasks` | Manage subtasks |
| GET/POST | `/api/tasks/[id]/comments` | Manage comments |
| POST | `/api/tasks/[id]/attachments` | Upload file attachment |
| POST | `/api/tasks/[id]/reminders` | Set due date reminder |
| GET/PUT | `/api/user/profile` | Get/update profile |
| PUT | `/api/user/password` | Change password |
| GET/PATCH | `/api/notifications` | Notification center |
| POST | `/api/notifications/subscribe` | Web push subscription |
| GET/POST | `/api/workspaces` | Team workspaces |
| POST | `/api/workspaces/[id]/members` | Invite member |
| GET | `/api/events` | SSE real-time stream |
| GET | `/api/share/[token]` | Public shared list |
| GET | `/api/admin/users` | Admin user list |
| GET | `/api/cron/reminders` | Process reminders (cron) |
| GET | `/api/openapi` | OpenAPI specification |

Interactive docs: `http://localhost:3000/docs`
