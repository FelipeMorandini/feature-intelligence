import type { RequestEnrichment } from "../triage/contract";

/**
 * Seed backlog for the fictional "Acme Projects" product.
 *
 * It mimics a backlog collected before triage existed, so it already contains
 * duplicates. The enrichment below is hand-written fixture data. It is stored
 * against a triage run whose model is SEED_FIXTURE_MODEL, so the app can label
 * it honestly instead of presenting it as live AI output.
 *
 * Planted relationships for the demo:
 * - Duplicates (same need, different words):
 *     seed-chat-assignment-alerts  ~ seed-ping-on-handoff
 *     seed-weekly-status-digest    ~ seed-stop-chasing-updates
 *     seed-dark-mode               ~ seed-night-theme
 * - Related-looking but NOT duplicates (shared keywords, different need):
 *     seed-recurring-tasks  vs seed-project-templates  (repeat on a schedule vs bootstrap structure)
 *     seed-csv-export       vs seed-client-pdf-export  (data analysis vs client-facing presentation)
 */

export const SEED_FIXTURE_MODEL = "seed-fixture";
export const SEED_PROMPT_VERSION = "seed";

export interface SeedRequest {
  id: string;
  title: string;
  description: string;
  daysAgo: number;
  supportCount: number;
  enrichment: RequestEnrichment;
}

export const SEED_REQUESTS: SeedRequest[] = [
  {
    id: "seed-chat-assignment-alerts",
    title: "Slack notifications when a task is assigned to me",
    description:
      "I live in Slack all day and constantly miss tasks that get assigned to me in Acme. Please send a Slack DM when I'm assigned a task or when one of my tasks is due tomorrow.",
    daysAgo: 41,
    supportCount: 14,
    enrichment: {
      problemStatement:
        "People who work mainly in chat miss new assignments and upcoming due dates because they are only visible inside the product.",
      theme: "notifications",
      themeRationale: "Asks to be alerted about assignments and due dates in an external channel.",
      rubric: {
        severity: {
          score: 4,
          rationale: "Missed assignments cause late work and follow-up pings between teammates.",
        },
        strategicAlignment: {
          score: 4,
          rationale: "Pushing assignments to people directly removes a common source of status-chasing.",
          goalIds: ["reduce-coordination-work"],
        },
        workaroundGap: {
          score: 3,
          rationale: "Email notifications exist but are easy to miss; teams forward items to chat manually.",
        },
      },
    },
  },
  {
    id: "seed-ping-on-handoff",
    title: "Ping me in our team chat when someone hands work to me",
    description:
      "When a teammate reassigns something to me I usually only find out days later in standup. It would help a lot to get a message in our chat tool the moment work is handed over.",
    daysAgo: 12,
    supportCount: 3,
    enrichment: {
      problemStatement:
        "People do not find out promptly when work is handed to them, so reassigned tasks sit idle until someone notices.",
      theme: "notifications",
      themeRationale: "Requests an immediate alert in a chat tool when work is reassigned.",
      rubric: {
        severity: {
          score: 4,
          rationale: "Reassigned work can stall for days, delaying delivery.",
        },
        strategicAlignment: {
          score: 4,
          rationale: "Removes the need to chase handoffs in standups and direct messages.",
          goalIds: ["reduce-coordination-work"],
        },
        workaroundGap: {
          score: 3,
          rationale: "In-app and email notifications exist but are not where these users look.",
        },
      },
    },
  },
  {
    id: "seed-weekly-status-digest",
    title: "Automatic weekly status digest for stakeholders",
    description:
      "Every Friday I copy task progress into an email for leadership. Acme should generate a weekly digest of what was completed, what's at risk and what's next, and email it to a list of stakeholders.",
    daysAgo: 35,
    supportCount: 9,
    enrichment: {
      problemStatement:
        "Project leads spend time every week manually compiling progress updates for stakeholders who do not use the product.",
      theme: "reporting",
      themeRationale: "Requests a generated, recurring summary of project status for stakeholders.",
      rubric: {
        severity: {
          score: 3,
          rationale: "A recurring manual chore rather than a blocker, but it costs time every week.",
        },
        strategicAlignment: {
          score: 5,
          rationale: "Directly reduces manual status work and improves visibility for other teams.",
          goalIds: ["reduce-coordination-work", "cross-team-visibility"],
        },
        workaroundGap: {
          score: 4,
          rationale: "Only workaround is copying progress into emails or slides by hand.",
        },
      },
    },
  },
  {
    id: "seed-stop-chasing-updates",
    title: "Stop me having to chase everyone for Friday updates",
    description:
      "Each week I message every team member asking what they finished so I can report upward. Could Acme just compile a summary of progress from the board automatically?",
    daysAgo: 6,
    supportCount: 2,
    enrichment: {
      problemStatement:
        "Managers have to ask each team member for progress every week in order to report upward.",
      theme: "reporting",
      themeRationale: "Wants an automatically compiled progress summary to replace manual collection.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Weekly time cost and interruption for the whole team, but work is not blocked.",
        },
        strategicAlignment: {
          score: 5,
          rationale: "Status-chasing is exactly the coordination work the strategy aims to remove.",
          goalIds: ["reduce-coordination-work", "cross-team-visibility"],
        },
        workaroundGap: {
          score: 4,
          rationale: "Today this is done by messaging people individually.",
        },
      },
    },
  },
  {
    id: "seed-recurring-tasks",
    title: "Recurring tasks",
    description:
      "Some tasks repeat on a schedule, like 'send the invoice report' every Monday or 'rotate on-call' every two weeks. I want to set a task to repeat so it reappears automatically with a new due date.",
    daysAgo: 52,
    supportCount: 11,
    enrichment: {
      problemStatement:
        "Teams must remember to recreate the same task every time a scheduled, repeating responsibility comes due.",
      theme: "automation",
      themeRationale: "Asks the product to recreate a single task automatically on a schedule.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Forgotten recurring tasks lead to missed obligations, though most are remembered.",
        },
        strategicAlignment: {
          score: 5,
          rationale: "A canonical example of automating a repetitive workflow.",
          goalIds: ["automate-repetitive-workflows"],
        },
        workaroundGap: {
          score: 4,
          rationale: "Users rely on calendar reminders and recreate the task by hand.",
        },
      },
    },
  },
  {
    id: "seed-project-templates",
    title: "Reusable templates for repeating project checklists",
    description:
      "Every sprint kickoff and every client onboarding we create the same 12 tasks with the same subtasks and owners. I'd like to save a project or checklist as a template and spin up a new copy in one click.",
    daysAgo: 28,
    supportCount: 6,
    enrichment: {
      problemStatement:
        "Teams rebuild the same multi-task project structure by hand whenever a familiar kind of project starts.",
      theme: "automation",
      themeRationale: "Asks to reuse a saved structure of many tasks when starting new work.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Setup is tedious and steps get missed, but it only happens at project start.",
        },
        strategicAlignment: {
          score: 4,
          rationale: "Reduces repetitive setup work, supporting workflow automation.",
          goalIds: ["automate-repetitive-workflows"],
        },
        workaroundGap: {
          score: 3,
          rationale: "Teams duplicate an old project and clean it up, which is slow but workable.",
        },
      },
    },
  },
  {
    id: "seed-csv-export",
    title: "Export tasks to CSV",
    description:
      "Our ops analyst needs raw task data (status, assignee, dates, custom fields) in a spreadsheet to analyse cycle time. Please add an export of any filtered task list to CSV.",
    daysAgo: 47,
    supportCount: 8,
    enrichment: {
      problemStatement:
        "Analysts cannot get raw task data out of the product to run their own analysis in spreadsheets.",
      theme: "reporting",
      themeRationale: "Requests a raw data export for external analysis.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Blocks a specific analysis workflow but not day-to-day project work.",
        },
        strategicAlignment: {
          score: 2,
          rationale: "Supports analysis outside the product; only loosely tied to visibility goals.",
          goalIds: ["cross-team-visibility"],
        },
        workaroundGap: {
          score: 4,
          rationale: "Data must be copied manually or pulled through the API by an engineer.",
        },
      },
    },
  },
  {
    id: "seed-client-pdf-export",
    title: "Export project timeline as a PDF for clients",
    description:
      "Agencies like us share timelines with clients who don't have Acme accounts. A clean, branded PDF of the project timeline would let us send progress without screenshots.",
    daysAgo: 19,
    supportCount: 4,
    enrichment: {
      problemStatement:
        "Agencies need a presentable way to share project timelines with clients who do not have access to the product.",
      theme: "reporting",
      themeRationale: "Requests a client-facing, presentation-quality export of the timeline.",
      rubric: {
        severity: {
          score: 2,
          rationale: "Screenshots work today; the gap is polish and time spent.",
        },
        strategicAlignment: {
          score: 3,
          rationale: "Improves communication with external stakeholders.",
          goalIds: ["cross-team-visibility"],
        },
        workaroundGap: {
          score: 2,
          rationale: "Screenshots or guest access cover most of the need.",
        },
      },
    },
  },
  {
    id: "seed-dark-mode",
    title: "Dark mode",
    description: "Please add a dark theme. The bright white interface is harsh, especially in the evening.",
    daysAgo: 60,
    supportCount: 18,
    enrichment: {
      problemStatement:
        "The bright interface is uncomfortable to use for long periods or in low-light conditions.",
      theme: "experience",
      themeRationale: "A visual preference and comfort request for the interface.",
      rubric: {
        severity: {
          score: 2,
          rationale: "Affects comfort rather than the ability to get work done.",
        },
        strategicAlignment: {
          score: 1,
          rationale: "Does not advance any of the stated strategy goals.",
          goalIds: [],
        },
        workaroundGap: {
          score: 3,
          rationale: "Browser extensions and OS settings help partially but break some layouts.",
        },
      },
    },
  },
  {
    id: "seed-night-theme",
    title: "Night theme for late shifts — white background hurts my eyes",
    description:
      "Our support engineers work night shifts and the white background causes eye strain after a few hours. A darker colour scheme option would make a real difference.",
    daysAgo: 3,
    supportCount: 1,
    enrichment: {
      problemStatement:
        "People working long or night-time shifts experience eye strain from the bright interface.",
      theme: "experience",
      themeRationale: "Requests a darker colour scheme for visual comfort.",
      rubric: {
        severity: {
          score: 2,
          rationale: "Real discomfort for some users, but work is not blocked.",
        },
        strategicAlignment: {
          score: 1,
          rationale: "Unrelated to the stated strategy goals.",
          goalIds: [],
        },
        workaroundGap: {
          score: 3,
          rationale: "Third-party dark-mode extensions provide a partial workaround.",
        },
      },
    },
  },
  {
    id: "seed-cross-team-dependencies",
    title: "See which tasks in other teams' projects are blocking ours",
    description:
      "We depend on the platform and design teams, but their work lives in separate projects. I want to link our tasks to theirs and see at a glance what's blocking us and who owns it.",
    daysAgo: 24,
    supportCount: 7,
    enrichment: {
      problemStatement:
        "Teams cannot see the status of work they depend on in other teams' projects, so blockers surface late.",
      theme: "planning",
      themeRationale: "Asks for visibility of dependencies across projects and teams.",
      rubric: {
        severity: {
          score: 4,
          rationale: "Hidden blockers cause schedule slips that are discovered too late.",
        },
        strategicAlignment: {
          score: 5,
          rationale: "Directly improves cross-team visibility and reduces coordination check-ins.",
          goalIds: ["cross-team-visibility", "reduce-coordination-work"],
        },
        workaroundGap: {
          score: 4,
          rationale: "Teams track dependencies in separate spreadsheets or ask in meetings.",
        },
      },
    },
  },
  {
    id: "seed-client-guest-access",
    title: "Read-only guest access for clients",
    description:
      "We'd like to invite clients to view a project's progress without giving them a paid seat or the ability to edit anything.",
    daysAgo: 33,
    supportCount: 5,
    enrichment: {
      problemStatement:
        "External clients cannot follow project progress directly without a paid, fully privileged account.",
      theme: "permissions",
      themeRationale: "Requests a restricted, view-only access level for external people.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Forces manual status sharing with clients, but does not block internal work.",
        },
        strategicAlignment: {
          score: 3,
          rationale: "Improves visibility for external stakeholders and reduces update requests.",
          goalIds: ["cross-team-visibility"],
        },
        workaroundGap: {
          score: 3,
          rationale: "Teams send screenshots or buy extra seats.",
        },
      },
    },
  },
  {
    id: "seed-pr-merge-auto-done",
    title: "Move tasks to Done automatically when the linked pull request merges",
    description:
      "Engineers forget to update task status after their GitHub PR is merged, so the board is always out of date. Linked tasks should move to Done when the PR merges.",
    daysAgo: 15,
    supportCount: 10,
    enrichment: {
      problemStatement:
        "Task status drifts from reality because engineers must update it by hand after their code ships.",
      theme: "integrations",
      themeRationale: "Connects source-control events to task status updates.",
      rubric: {
        severity: {
          score: 3,
          rationale: "Stale boards mislead stakeholders and trigger status questions.",
        },
        strategicAlignment: {
          score: 5,
          rationale: "Automates a repetitive update and removes a source of status-chasing.",
          goalIds: ["automate-repetitive-workflows", "reduce-coordination-work"],
        },
        workaroundGap: {
          score: 4,
          rationale: "The only workaround is remembering to update the task manually.",
        },
      },
    },
  },
  {
    id: "seed-mobile-offline",
    title: "Offline mode in the mobile app",
    description:
      "Our field technicians lose signal on site. They'd like to view and tick off their tasks offline and have changes sync when they reconnect.",
    daysAgo: 9,
    supportCount: 2,
    enrichment: {
      problemStatement:
        "Field workers without connectivity cannot view or update their tasks while on site.",
      theme: "experience",
      themeRationale: "Concerns mobile usability in poor connectivity conditions.",
      rubric: {
        severity: {
          score: 4,
          rationale: "Completely blocks task updates for affected users while offline.",
        },
        strategicAlignment: {
          score: 2,
          rationale: "Indirectly improves status accuracy, but is not a stated strategic focus.",
          goalIds: [],
        },
        workaroundGap: {
          score: 3,
          rationale: "Users note updates on paper and enter them later.",
        },
      },
    },
  },
];
