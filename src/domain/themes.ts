/**
 * Closed theme taxonomy. The model must pick one of these ids; anything else
 * fails validation. A fixed list keeps grouping stable and inspectable — a
 * production system could evolve this into PM-managed or emergent clusters.
 */
export const THEMES = [
  {
    id: "notifications",
    label: "Notifications & Alerts",
    description: "Telling people when something needs their attention, in-app or in other tools.",
  },
  {
    id: "reporting",
    label: "Reporting & Exports",
    description: "Summaries, dashboards, status reports and getting data out of the product.",
  },
  {
    id: "automation",
    label: "Workflow Automation",
    description: "Removing repetitive manual steps: rules, recurrence, templates, auto-updates.",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connecting the product with third-party tools such as chat, source control or calendars.",
  },
  {
    id: "planning",
    label: "Planning & Visibility",
    description: "Timelines, dependencies and seeing work across projects and teams.",
  },
  {
    id: "collaboration",
    label: "Collaboration",
    description: "Working together on tasks: comments, mentions, sharing and handoffs.",
  },
  {
    id: "permissions",
    label: "Permissions & Access",
    description: "Who can see or change what, including guests and external stakeholders.",
  },
  {
    id: "experience",
    label: "UX & Accessibility",
    description: "Look and feel, accessibility, mobile and general usability.",
  },
  {
    id: "other",
    label: "Other",
    description: "Requests that do not fit any of the themes above.",
  },
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemeId = Theme["id"];

export const THEME_IDS = THEMES.map((theme) => theme.id) as [ThemeId, ...ThemeId[]];

export function getTheme(id: ThemeId): Theme {
  const theme = THEMES.find((candidate) => candidate.id === id);
  if (!theme) throw new Error(`Unknown theme: ${id}`);
  return theme;
}
