/**
 * Explicit product context used to assess strategic alignment.
 *
 * This is deliberately visible configuration rather than hidden prompt logic:
 * the same goals are sent to the model and shown to users, so anyone can check
 * an alignment score against what the product is actually trying to achieve.
 */
export const PRODUCT_STRATEGY = {
  productName: "Acme Projects",
  productDescription:
    "A B2B project-management product used by cross-functional teams to plan, track and deliver work.",
  goals: [
    {
      id: "reduce-coordination-work",
      title: "Reduce manual status-chasing and coordination work.",
      description:
        "Fewer pings, meetings and spreadsheets just to find out where work stands or who is doing what.",
    },
    {
      id: "cross-team-visibility",
      title: "Improve visibility and communication across teams.",
      description:
        "Make progress, dependencies and changes visible to the people and teams who rely on them.",
    },
    {
      id: "automate-repetitive-workflows",
      title: "Help teams automate repetitive project workflows.",
      description:
        "Let teams set work up once and have the product repeat, route or update it for them.",
    },
  ],
} as const;

export type StrategyGoal = (typeof PRODUCT_STRATEGY.goals)[number];
export type StrategyGoalId = StrategyGoal["id"];

export const STRATEGY_GOAL_IDS = PRODUCT_STRATEGY.goals.map((goal) => goal.id) as [
  StrategyGoalId,
  ...StrategyGoalId[],
];
