/**
 * Static comparison content for /compare/*.
 * Competitor facts are from public pricing/feature pages, checked Nov 2026.
 * Only list Taskflow features that exist in the product today.
 */
export const COMPARE_AS_OF = "Nov 2026";

export type CompareRow = { feature: string; taskflow: string; other: string };

export type CompareData = {
  slug: "trello" | "asana" | "todoist";
  name: string;
  title: string;
  description: string;
  intro: string;
  sourceUrl: string;
  rows: CompareRow[];
  pickTaskflow: string[];
  pickOther: string[];
};

const TF_FREE = "Free: up to 5 members and 5 projects per workspace, no card";
const TF_PAID = "Larger teams: ₹299 (Pro) or ₹999 (Business) per workspace per month, as listed in the pricing section";
const TF_MCP = "Built-in MCP server (/api/mcp) with personal API tokens or OAuth, so AI assistants can read and update tasks";

export const COMPARISONS: CompareData[] = [
  {
    slug: "trello",
    name: "Trello",
    title: "TaskFlow vs Trello: honest comparison for small teams",
    description:
      "TaskFlow vs Trello compared: boards, subtasks, chat and docs, INR pricing and AI-agent (MCP) support. Who should pick which, as of Nov 2026.",
    intro:
      "Trello is a simple Kanban tool with a large Power-Up ecosystem. TaskFlow is a smaller product that puts list, board, calendar, timeline, chat and docs in one place, priced in INR.",
    sourceUrl: "https://trello.com/pricing",
    rows: [
      { feature: "Core views", taskflow: "List, board, calendar, timeline", other: "Board is the core; calendar and timeline on paid plans" },
      { feature: "Subtasks and dependencies", taskflow: "Subtasks, sections, blocked-by dependencies", other: "Checklists on cards; dependencies via Power-Ups or higher plans" },
      { feature: "Chat and docs", taskflow: "Built-in team chat, docs and meeting minutes", other: "Not built in; use integrations" },
      { feature: "Integrations", taskflow: "REST API, inbound webhook, MCP server. No integration marketplace yet", other: "Large Power-Up directory (200+ integrations)" },
      { feature: "AI and agents", taskflow: TF_MCP, other: "AI features on paid plans" },
      { feature: "Mobile", taskflow: "Installable web app (PWA), no native apps", other: "Native iOS and Android apps" },
      { feature: "Free plan", taskflow: TF_FREE, other: "Up to 10 collaborators and 10 boards per workspace" },
      { feature: "Paid pricing", taskflow: TF_PAID, other: "Standard $5 and Premium $10 per user per month, billed annually" },
      { feature: "Seats and billing", taskflow: "Per workspace, not per user", other: "Every Workspace member is a billable user on paid plans; guests on more than one board are billed as members (trello.com/pricing, as of Nov 2026)" },
    ],
    pickTaskflow: [
      "You want tasks, chat and docs in one app instead of boards plus Power-Ups",
      "You want INR pricing per workspace rather than per user",
      "You want AI assistants to manage tasks through MCP",
    ],
    pickOther: [
      "You need native mobile apps or a big integration marketplace today",
      "Your team already runs on Trello Power-Ups",
    ],
  },
  {
    slug: "asana",
    name: "Asana",
    title: "TaskFlow vs Asana: honest comparison for small teams",
    description:
      "TaskFlow vs Asana compared: views, subtasks, built-in chat and docs, INR pricing and MCP support for AI agents. Who should pick which, as of Nov 2026.",
    intro:
      "Asana is a mature work-management platform with goals, portfolios and reporting. TaskFlow is smaller and simpler, aimed at small teams that want tasks, chat and docs together with INR pricing.",
    sourceUrl: "https://asana.com/pricing",
    rows: [
      { feature: "Core views", taskflow: "List, board, calendar, timeline", other: "List, board, calendar, timeline and more" },
      { feature: "Subtasks and dependencies", taskflow: "Subtasks, sections, blocked-by dependencies, custom fields", other: "Subtasks, dependencies, custom fields (some on paid plans)" },
      { feature: "Chat and docs", taskflow: "Built-in team chat, docs and meeting minutes", other: "Comments and project messages; no built-in team chat" },
      { feature: "Goals, portfolios, workload, forms", taskflow: "Not available", other: "Available on paid plans" },
      { feature: "AI and agents", taskflow: TF_MCP, other: "Built-in AI features on paid plans" },
      { feature: "Mobile", taskflow: "Installable web app (PWA), no native apps", other: "Native iOS and Android apps" },
      { feature: "Free plan", taskflow: TF_FREE, other: "Personal plan, limited to 2 users" },
      { feature: "Paid pricing", taskflow: TF_PAID, other: "Starter $10.99 and Advanced $24.99 per user per month, billed annually" },
      { feature: "Seats and billing", taskflow: "Per workspace, not per user", other: "Free Personal plan is limited to 2 users; paid plans are billed per user (asana.com/pricing, as of Nov 2026)" },
    ],
    pickTaskflow: [
      "You are a small team that outgrew a to-do list and wants a free plan above 2 users",
      "You want chat and docs next to tasks, and INR pricing per workspace",
      "You want AI assistants to work on tasks through MCP",
    ],
    pickOther: [
      "You need goals, portfolios, workload views or forms",
      "You need native mobile apps and a large integration catalog",
    ],
  },
  {
    slug: "todoist",
    name: "Todoist",
    title: "TaskFlow vs Todoist: honest comparison for small teams",
    description:
      "TaskFlow vs Todoist compared: quick add, projects, team features, INR pricing and MCP support for AI agents. Who should pick which, as of Nov 2026.",
    intro:
      "Todoist is one of the fastest personal to-do apps. TaskFlow adds team features on top of tasks: timeline, dependencies, time tracking, chat and docs, plus a free plan for small teams.",
    sourceUrl: "https://www.todoist.com/pricing",
    rows: [
      { feature: "Quick add", taskflow: "Quick-add parsing for dates, priority and projects, including Hinglish like 'kal 5 baje'", other: "Smart Quick Add in many languages, plus voice capture (Ramble)" },
      { feature: "Projects and sections", taskflow: "Projects with sections, subtasks, recurrence, reminders", other: "Projects, sections, subtasks, recurring dates" },
      { feature: "Views", taskflow: "List, board, calendar, timeline", other: "List and board free; calendar and table layouts on Pro" },
      { feature: "Team features", taskflow: "Shared workspaces, dependencies, time tracking, chat, docs, meeting minutes, custom fields", other: "Shared workspace on Business plan" },
      { feature: "AI and agents", taskflow: TF_MCP, other: "AI-assisted capture and filters" },
      { feature: "Mobile and desktop", taskflow: "Installable web app (PWA), no native apps", other: "Native mobile and desktop apps" },
      { feature: "Free plan", taskflow: TF_FREE, other: "Beginner plan: 5 personal projects" },
      { feature: "Paid pricing", taskflow: TF_PAID, other: "Pro $7 per month; Business $10 per user per month (monthly billing)" },
      { feature: "Seats and billing", taskflow: "Per workspace, not per user", other: "Business is billed per team member; the free plan allows 5 team projects (todoist.com/pricing, as of Nov 2026)" },
    ],
    pickTaskflow: [
      "You work in a small team and need timeline, dependencies, chat and docs, not just a list",
      "You want a free team plan and INR pricing per workspace",
      "You want AI assistants to manage tasks through MCP",
    ],
    pickOther: [
      "You mostly manage personal tasks and want the fastest capture, voice input and native apps",
      "You rely on Todoist's wide integrations",
    ],
  },
];

export function getComparison(slug: CompareData["slug"]): CompareData {
  const c = COMPARISONS.find((x) => x.slug === slug);
  if (!c) throw new Error(`Unknown comparison: ${slug}`);
  return c;
}
