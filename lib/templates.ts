/**
 * Static content for /templates/*.
 * Only describes features that exist in TaskFlow today: projects, sections, tasks,
 * subtasks, assignees, priorities, due dates, tags, dependencies, custom fields,
 * recurring tasks, project templates, Hinglish quick add, and list/board/calendar/timeline views.
 */
export type TemplateGuide = {
  slug: string;
  h1: string;
  title: string;
  desc: string;
  intro: string;
  steps: string[];
  example: { section: string; tasks: string[] }[];
};

export const TEMPLATE_GUIDES: TemplateGuide[] = [
  {
    "slug": "sprint-planning",
    "h1": "Sprint planning template",
    "title": "Sprint planning template for small teams",
    "desc": "Set up a two-week sprint in TaskFlow with sections, assignees, priorities, due dates and dependencies. Free, no card.",
    "intro": "Run a simple two-week sprint without heavy tooling. One project per sprint, one section per stage.",
    "steps": [
      "Create a project named after the sprint, e.g. \"Sprint 14 (24 Nov - 5 Dec)\".",
      "Add sections for the stages: Backlog, This sprint, In progress, Review, Done.",
      "Add tasks, set a priority (Low, Medium, High) and a due date on each, and assign them to teammates.",
      "Break big stories into subtasks and mark blocked work with task dependencies.",
      "Switch between list, board, calendar and timeline views during standup. Use the project stats to see what is done."
    ],
    "example": [
      {
        "section": "Backlog",
        "tasks": [
          "Payment retry logic",
          "Dark mode colors audit"
        ]
      },
      {
        "section": "This sprint",
        "tasks": [
          "Fix signup email bug (High)",
          "Add CSV export to reports"
        ]
      },
      {
        "section": "In progress",
        "tasks": [
          "Onboarding checklist copy"
        ]
      },
      {
        "section": "Review",
        "tasks": [
          "API rate limit PR"
        ]
      },
      {
        "section": "Done",
        "tasks": [
          "Upgrade dependencies"
        ]
      }
    ]
  },
  {
    "slug": "client-projects",
    "h1": "Client project tracking template",
    "title": "Client project tracking template for freelancers and agencies",
    "desc": "Track client work in TaskFlow: one project per client, sections per phase, assignees, due dates and custom fields. Free to start.",
    "intro": "Freelancers and small agencies can keep every client in its own project with clear phases and deadlines.",
    "steps": [
      "Create one project per client, e.g. \"Acme Traders website\".",
      "Add sections per phase: Discovery, Design, Build, Client review, Delivered.",
      "Add custom fields at project level such as Client (text), Budget (number) or Launch date (date).",
      "Create tasks with due dates and assignees, and use subtasks for the small deliverables.",
      "Once a project is set up well, save it as a project template and reuse it for the next client."
    ],
    "example": [
      {
        "section": "Discovery",
        "tasks": [
          "Kickoff call",
          "Collect brand assets",
          "Sign off scope"
        ]
      },
      {
        "section": "Design",
        "tasks": [
          "Homepage mockup",
          "Mobile layout"
        ]
      },
      {
        "section": "Build",
        "tasks": [
          "Build landing page",
          "Contact form"
        ]
      },
      {
        "section": "Client review",
        "tasks": [
          "Send staging link",
          "Collect feedback"
        ]
      },
      {
        "section": "Delivered",
        "tasks": [
          "Handover document"
        ]
      }
    ]
  },
  {
    "slug": "content-calendar",
    "h1": "Content calendar template",
    "title": "Content calendar template for social and blog teams",
    "desc": "Plan posts and blog articles in TaskFlow with sections, due dates, assignees and the calendar view. Free to start.",
    "intro": "Plan what gets published and when, and see the whole month in the calendar view.",
    "steps": [
      "Create a project called \"Content calendar\".",
      "Add sections: Ideas, Writing, Design, Ready to publish, Published.",
      "Add a task per post. Set the due date to the publish date and assign a writer.",
      "Use subtasks for steps such as draft, graphic and caption, and tags for the channel.",
      "Open the calendar view to see the month, and make a repeating task (daily, weekly or monthly) for routine posts."
    ],
    "example": [
      {
        "section": "Ideas",
        "tasks": [
          "Customer story: Pune agency",
          "5 Hinglish productivity tips"
        ]
      },
      {
        "section": "Writing",
        "tasks": [
          "Blog: sprint planning basics"
        ]
      },
      {
        "section": "Design",
        "tasks": [
          "Instagram carousel"
        ]
      },
      {
        "section": "Ready to publish",
        "tasks": [
          "LinkedIn post (Tue)"
        ]
      },
      {
        "section": "Published",
        "tasks": [
          "Launch announcement"
        ]
      }
    ]
  },
  {
    "slug": "bug-tracking",
    "h1": "Bug tracking template",
    "title": "Simple bug tracking template for small dev teams",
    "desc": "Track bugs in TaskFlow with sections for status, priorities, assignees, dependencies and comments. No separate bug tool needed.",
    "intro": "A lightweight bug board for small teams that do not need a full issue tracker.",
    "steps": [
      "Create a project named \"Bugs\".",
      "Add sections: Reported, Confirmed, Fixing, Testing, Fixed.",
      "Log each bug as a task. Use priority for severity and put steps to reproduce in the description.",
      "Assign an owner, set a due date for high priority bugs and add attachments or comments for screenshots.",
      "Use task dependencies when one bug blocks another, and the board view to move bugs between stages."
    ],
    "example": [
      {
        "section": "Reported",
        "tasks": [
          "Login page blank on Safari"
        ]
      },
      {
        "section": "Confirmed",
        "tasks": [
          "CSV export misses last row (Medium)"
        ]
      },
      {
        "section": "Fixing",
        "tasks": [
          "Timer not stopping on logout (High)"
        ]
      },
      {
        "section": "Testing",
        "tasks": [
          "Wrong date in email digest"
        ]
      },
      {
        "section": "Fixed",
        "tasks": [
          "Typo on pricing page"
        ]
      }
    ]
  },
  {
    "slug": "daily-todo",
    "h1": "Daily to-do template (Hinglish)",
    "title": "Daily to-do list template for Indian teams (Hinglish)",
    "desc": "Daily to-do list in TaskFlow for Indian teams: Hinglish quick add like \"kal 5 baje client call !high\", priorities and repeating tasks.",
    "intro": "Roz ka kaam simple rakho. TaskFlow ka quick add Hinglish samajhta hai, jaise \"kal 5 baje client call !high\".",
    "steps": [
      "Ek project banao, jaise \"Daily kaam\", aur sections rakho: Aaj, Kal, Is hafte, Ho gaya.",
      "Quick add mein Hinglish likho: \"kal 5 baje client call !high\" se title, date, time aur priority apne aap set ho jate hain.",
      "Har task par priority (Low, Medium, High) lagao aur team ke kisi bande ko assign karo.",
      "Roz wale kaam ke liye repeating task (daily, weekly ya monthly) banao.",
      "Din ke end mein dashboard dekho: kya complete hua aur kya kal ko jaana hai."
    ],
    "example": [
      {
        "section": "Aaj",
        "tasks": [
          "Client ko invoice bhejna (High)",
          "Team standup 10 baje"
        ]
      },
      {
        "section": "Kal",
        "tasks": [
          "kal 5 baje client call !high"
        ]
      },
      {
        "section": "Is hafte",
        "tasks": [
          "GST filing ka data ready karna",
          "Vendor payment follow-up"
        ]
      },
      {
        "section": "Ho gaya",
        "tasks": [
          "Subah ki email reply"
        ]
      }
    ]
  }
];

export function getTemplateGuide(slug: string): TemplateGuide {
  const g = TEMPLATE_GUIDES.find((t) => t.slug === slug);
  if (!g) throw new Error(`Unknown template guide: ${slug}`);
  return g;
}
