// Shared between the authenticated dashboard (DashboardHome) and the public
// landing page hero, so the marketing page's AI input offers the exact same
// starter prompts as the real product — not a separately-written, drifting
// copy of them.
export const QUICK_START_PROMPTS = [
  "I'm relocating and want to continue my career",
  'Should I look locally, remotely or freelance?',
  'Help me plan my move',
  'What should I do first?',
] as const;
