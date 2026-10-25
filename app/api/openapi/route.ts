import { NextResponse } from "next/server";

const spec = {
  openapi: "3.0.0",
  info: {
    title: "TaskFlow API",
    version: "2.0.0",
    description: "Full-stack task management API",
  },
  servers: [{ url: process.env.NEXTAUTH_URL ?? "http://localhost:3000" }],
  paths: {
    "/api/auth/register": {
      post: { summary: "Register user", tags: ["Auth"] },
    },
    "/api/auth/login": {
      post: { summary: "Login user", tags: ["Auth"] },
    },
    "/api/auth/forgot-password": {
      post: { summary: "Request password reset", tags: ["Auth"] },
    },
    "/api/auth/reset-password": {
      post: { summary: "Reset password", tags: ["Auth"] },
    },
    "/api/tasks": {
      get: { summary: "List tasks with filters and pagination", tags: ["Tasks"] },
      post: { summary: "Create task", tags: ["Tasks"] },
    },
    "/api/tasks/{id}": {
      get: { summary: "Get task", tags: ["Tasks"] },
      put: { summary: "Update task", tags: ["Tasks"] },
      patch: { summary: "Archive/unarchive task", tags: ["Tasks"] },
      delete: { summary: "Delete task", tags: ["Tasks"] },
    },
    "/api/tasks/bulk": {
      post: { summary: "Bulk complete/archive/delete", tags: ["Tasks"] },
    },
    "/api/tasks/import": {
      post: { summary: "Import tasks from JSON", tags: ["Tasks"] },
    },
    "/api/categories": {
      get: { summary: "List categories", tags: ["Categories"] },
      post: { summary: "Create category", tags: ["Categories"] },
    },
    "/api/tags": {
      get: { summary: "List tags", tags: ["Tags"] },
      post: { summary: "Create tag", tags: ["Tags"] },
    },
    "/api/user/profile": {
      get: { summary: "Get profile", tags: ["User"] },
      put: { summary: "Update profile", tags: ["User"] },
    },
    "/api/user/password": {
      put: { summary: "Change password", tags: ["User"] },
    },
    "/api/notifications": {
      get: { summary: "List notifications", tags: ["Notifications"] },
    },
    "/api/workspaces": {
      get: { summary: "List workspaces", tags: ["Workspaces"] },
      post: { summary: "Create workspace", tags: ["Workspaces"] },
    },
    "/api/workspaces/{id}/projects": {
      get: { summary: "List projects in a workspace", tags: ["Projects"] },
      post: { summary: "Create a project", tags: ["Projects"] },
    },
    "/api/projects/{id}": {
      get: { summary: "Get a project with sections and tasks", tags: ["Projects"] },
      patch: { summary: "Update a project", tags: ["Projects"] },
      delete: { summary: "Delete a project", tags: ["Projects"] },
    },
    "/api/projects/{id}/sections": {
      get: { summary: "List project sections", tags: ["Projects"] },
      post: { summary: "Create a section", tags: ["Projects"] },
    },
    "/api/projects/{id}/sections/{sectionId}": {
      patch: { summary: "Rename a section", tags: ["Projects"] },
      delete: { summary: "Delete a section", tags: ["Projects"] },
    },
    "/api/projects/{id}/sections/reorder": {
      put: { summary: "Reorder sections", tags: ["Projects"] },
    },
    "/api/projects/{id}/tasks/move": {
      post: { summary: "Move or reorder a task within a project", tags: ["Projects"] },
    },
    "/api/projects/{id}/members": {
      get: { summary: "List project members", tags: ["Projects"] },
      post: { summary: "Add a project member", tags: ["Projects"] },
    },
    "/api/projects/{id}/members/{memberId}": {
      patch: { summary: "Change a project member role", tags: ["Projects"] },
      delete: { summary: "Remove a project member", tags: ["Projects"] },
    },
    "/api/events": {
      get: { summary: "SSE real-time events", tags: ["Real-time"] },
    },
    "/api/share/{token}": {
      get: { summary: "Public shared category", tags: ["Sharing"] },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec);
}
