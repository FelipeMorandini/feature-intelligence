/**
 * Labeled cases for `npm run eval`.
 *
 * Unit tests (`npm test`) verify deterministic application behavior and safety
 * boundaries with a fake model. These cases probe the real model's judgment,
 * which is probabilistic: run them deliberately, with a real API key, and read
 * the results as a signal — not as a pass/fail gate.
 *
 * Every case is triaged against the seeded Acme Projects backlog
 * (src/db/seed-data.ts). Only the structured outcome is checked, never the
 * wording of rationales.
 */

export type ExpectedTriage =
  /** Must be surfaced as the probable duplicate (high/medium confidence) that requires a human decision. */
  | { kind: "duplicate"; requestId: string }
  /** Must not require a decision, but one of these requests should be surfaced as a non-blocking match. */
  | { kind: "related"; anyOf: string[] }
  /** Must not require a decision. Non-blocking related matches are acceptable. */
  | { kind: "new"; hardNegativeOf?: string };

export interface TriageEvalCase {
  id: string;
  title: string;
  description: string;
  expected: ExpectedTriage;
  notes: string;
}

export const TRIAGE_EVAL_CASES: TriageEvalCase[] = [
  {
    id: "dup-monthly-repeat",
    title: "Tasks that regenerate on a fixed cadence",
    description:
      "Some of our work comes back every month, like renewing vendor contracts on the 1st. I want a task to recreate itself on that schedule instead of someone remembering to add it again.",
    expected: { kind: "duplicate", requestId: "seed-recurring-tasks" },
    notes: "Same need as recurring tasks, different wording and cadence.",
  },
  {
    id: "dup-gitlab-merge",
    title: "Close the task when its GitLab merge request is merged",
    description:
      "We use GitLab, not GitHub. Developers forget to update tasks after merging, so boards are stale. Mark the linked task complete automatically when the merge request merges.",
    expected: { kind: "duplicate", requestId: "seed-pr-merge-auto-done" },
    notes: "Different source-control tool; same underlying need for automatic status updates.",
  },
  {
    id: "dup-customer-view-only",
    title: "View-only login for our customers",
    description:
      "Customers keep emailing to ask how their project is going. Let them sign in and check milestones themselves, without being able to change anything or costing us a seat.",
    expected: { kind: "duplicate", requestId: "seed-client-guest-access" },
    notes: "Same as read-only guest access for clients.",
  },
  {
    id: "dup-blocked-by-other-departments",
    title: "Which other departments are holding up my project?",
    description:
      "My project depends on work owned by the legal and data teams. I need to link my tasks to theirs and see quickly which of their items are blocking us.",
    expected: { kind: "duplicate", requestId: "seed-cross-team-dependencies" },
    notes: "Same need as cross-team dependency visibility.",
  },
  {
    id: "related-guest-comments",
    title: "Let external guests comment on tasks",
    description:
      "Our clients want to leave feedback directly on deliverables. Allow invited guests to add comments on specific tasks so we stop collecting feedback over email.",
    expected: { kind: "related", anyOf: ["seed-client-guest-access"] },
    notes: "Same area as read-only guest access, but needs guests to contribute, which view-only access does not provide.",
  },
  {
    id: "related-quiet-hours",
    title: "Pause notifications outside my working hours",
    description:
      "I get alerts at night and on weekends. Let me set quiet hours so notifications wait until my working day starts.",
    expected: { kind: "related", anyOf: ["seed-chat-assignment-alerts", "seed-ping-on-handoff"] },
    notes: "Notification area, but the opposite outcome: fewer alerts at certain times, not new alerts.",
  },
  {
    id: "hard-negative-spreadsheet-import",
    title: "Import tasks from a CSV spreadsheet",
    description:
      "When we start a project we already have the task list in a spreadsheet. Let us upload a CSV file and create all the tasks at once.",
    expected: { kind: "new", hardNegativeOf: "seed-csv-export" },
    notes: "Shares 'CSV' and 'spreadsheet' with the export request, but data flows the other way for a different need.",
  },
  {
    id: "hard-negative-auto-assign",
    title: "Automatically assign new tasks to whoever has capacity",
    description:
      "Distributing incoming work is manual and uneven. Assign new tasks automatically to the team member with the lightest current workload.",
    expected: { kind: "new", hardNegativeOf: "seed-chat-assignment-alerts" },
    notes: "Shares 'assigned' with the assignment-alert requests, but is about who gets work, not being told about it.",
  },
  {
    id: "new-time-tracking",
    title: "Track time spent on tasks",
    description:
      "We bill clients by the hour. Let people start and stop a timer on a task and see total hours per project.",
    expected: { kind: "new" },
    notes: "Nothing in the backlog covers time tracking.",
  },
  {
    id: "new-two-factor",
    title: "Two-factor authentication",
    description:
      "Our security team requires two-factor authentication for every SaaS tool. Add an authenticator-app option at sign-in.",
    expected: { kind: "new" },
    notes: "A security request; guest access is in the same theme but unrelated.",
  },
];
