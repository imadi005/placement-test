// The six real academic sections (from KJU's own roster — see
// prisma/seed.ts) — replaces the artificial A/B/C performance "batch" as
// the concept tests are scoped/grouped by everywhere. `Student.batch`
// still exists as a column (the separate batch-promotion admin feature
// still uses it), but no test-visibility, leaderboard, or analytics code
// should read it anymore — this list is the single source of truth for
// what a Test.batchScope value is allowed to be.
export const SECTIONS = [
  "MCA A",
  "MCA B",
  "MCA C",
  "MCA D",
  "MSc Computer Science",
  "MSc Data Science",
] as const;

export const TEST_SCOPES = [...SECTIONS, "ALL"] as const;
