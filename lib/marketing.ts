import { PLANS, type PlanId } from "@/lib/billing-plans";

/**
 * Public marketing copy for the landing page and /help.
 * Display prices only: the amount actually charged comes from the Stripe Price
 * configured in STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS. Keep these in sync.
 */
export const DISPLAY_PRICES: Record<PlanId, string> = {
  FREE: "₹0",
  PRO: "₹299",
  BUSINESS: "₹999",
};

export type PricingCard = {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  highlighted: boolean;
};

export function pricingCards(): PricingCard[] {
  return (Object.keys(PLANS) as PlanId[]).map((id) => ({
    id,
    name: PLANS[id].name,
    price: DISPLAY_PRICES[id],
    period: id === "FREE" ? "forever" : "per workspace / month",
    tagline: PLANS[id].tagline,
    features: PLANS[id].features,
    cta: id === "FREE" ? "Start for free" : `Start free, upgrade to ${PLANS[id].name}`,
    highlighted: id === "PRO",
  }));
}

export const FAQ: { q: string; a: string }[] = [
  { q: "Is there a free plan?", a: "Yes. The Free plan covers up to 5 members and 5 projects per workspace, with no card required." },
  { q: "How do I upgrade?", a: "Workspace owners can upgrade from the workspace's Billing card. Payment is handled by Stripe Checkout, and you can manage or cancel the subscription from the Stripe customer portal." },
  { q: "Can I bring my team?", a: "Yes. Invite people by email or with an invite link, and give them owner, admin, member or viewer access." },
  { q: "Can I connect other tools?", a: "Yes. TaskFlow has a REST API with personal tokens, outgoing webhooks, and an MCP server so AI assistants can work with your tasks." },
  { q: "Is my data backed up?", a: "Database backups are stored off-site in private storage, and deleted projects and tasks can be restored from the trash." },
];

export type HelpArticle = { id: string; title: string; summary: string; steps: string[] };

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "Create your account and your first project in a few minutes.",
    steps: [
      "Sign up at /register with your name, email and a password.",
      "You land on your personal dashboard. Create a team workspace from the workspace switcher when you want to work with others.",
      "Create a project, add a few tasks, and set assignees and due dates.",
      "Press Ctrl+K (Cmd+K on Mac) anywhere to search tasks, projects and docs or jump to a page.",
    ],
  },
  {
    id: "team",
    title: "Invite your team",
    summary: "Bring people into a workspace and control what they can do.",
    steps: [
      "Open the workspace from Workspaces in the sidebar.",
      "Invite by email, or create an invite link and share it.",
      "Pick a role for each person: owner, admin, member or viewer.",
      "Change roles or remove members at any time from the same page.",
    ],
  },
  {
    id: "views",
    title: "Projects, views and tasks",
    summary: "Plan work the way your team likes to see it.",
    steps: [
      "Every project has List, Board, Calendar and Timeline views.",
      "Group tasks into sections, add subtasks, dependencies and custom fields.",
      "Use comments and @mentions on a task to discuss work; followers get notified.",
      "My Work shows everything assigned to you across workspaces.",
    ],
  },
  {
    id: "billing",
    title: "Plans and billing",
    summary: "Free for small teams, paid plans when you grow.",
    steps: [
      "Free: up to 5 members and 5 projects. Pro (₹299/month per workspace): up to 25 members and 50 projects. Business (₹999/month per workspace): unlimited.",
      "Workspace owners upgrade from the workspace's Billing card; payment runs through Stripe Checkout.",
      "Change card, download invoices or cancel from the Stripe customer portal linked on the Billing page.",
    ],
  },
  {
    id: "integrations",
    title: "API, webhooks and AI assistants",
    summary: "Connect TaskFlow to the rest of your stack.",
    steps: [
      "Create a personal API token in Settings and call the REST API (see /docs for the endpoint list).",
      "Add outgoing webhooks to get task events in your own systems.",
      "Point an MCP-capable AI assistant at /api/mcp with your token or OAuth to manage tasks from chat.",
    ],
  },
  {
    id: "account",
    title: "Account and security",
    summary: "Keep your account safe.",
    steps: [
      "Reset a forgotten password from the sign-in page.",
      "Review active sessions and sign out everywhere from Settings.",
      "Workspace admins can review the activity and audit log for important changes.",
    ],
  },
];
