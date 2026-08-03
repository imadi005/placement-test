import { Injectable, Logger } from "@nestjs/common";

// Judge0 CE's well-known default language ids (stable across recent
// releases, but confirm against your instance's GET /languages if in
// doubt — overridable per-language via env so a version mismatch never
// needs a code change).
const LANGUAGE_IDS: Record<string, number> = {
  c: Number(process.env.JUDGE0_LANG_C ?? 50), // C (GCC 9.2.0)
  cpp: Number(process.env.JUDGE0_LANG_CPP ?? 54), // C++ (GCC 9.2.0)
  java: Number(process.env.JUDGE0_LANG_JAVA ?? 62), // Java (OpenJDK 13.0.1)
  python: Number(process.env.JUDGE0_LANG_PYTHON ?? 71), // Python (3.8.1)
};

// Judge0 status ids that mean "the code ran, but produced the wrong
// output" vs. every other bucket, which we fold into a coarser status
// string for storage/display.
const STATUS_LABELS: Record<number, string> = {
  3: "accepted",
  4: "wrong_answer",
  5: "time_limit_exceeded",
  6: "compile_error",
  13: "internal_error",
  14: "exec_format_error",
};
function statusLabel(statusId: number): string {
  if (STATUS_LABELS[statusId]) return STATUS_LABELS[statusId];
  if (statusId >= 7 && statusId <= 12) return "runtime_error";
  return "unknown";
}

export interface JudgeCase {
  id: string;
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

export interface JudgeCaseResult {
  testCaseId: string;
  isSample: boolean;
  passed: boolean;
  points: number;
  actualOutput: string;
  stderr: string | null;
  compileOutput: string | null;
  status: string;
  timeMs: number | null;
  memoryKb: number | null;
}

// Trailing-whitespace/newline differences are not meaningful for a
// competitive-judge style comparison — everything else has to match
// exactly (never "fuzzy" beyond this, or a genuinely wrong answer could
// pass).
function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);
  private readonly baseUrl = process.env.JUDGE0_URL;
  private readonly authToken = process.env.JUDGE0_AUTH_TOKEN;

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers["X-Auth-Token"] = this.authToken;
    return headers;
  }

  // Runs one submission against every given test case, sequentially — a
  // coding round has a handful of cases per problem, not thousands;
  // sequential + wait=true keeps this simple and keeps Judge0's own queue
  // (Redis-backed) as the only place load actually gets managed.
  async runAgainstCases(
    sourceCode: string,
    language: string,
    timeLimitMs: number,
    memoryLimitMb: number,
    cases: JudgeCase[]
  ): Promise<JudgeCaseResult[]> {
    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return cases.map((c) => ({
        testCaseId: c.id,
        isSample: c.isSample,
        passed: false,
        // A non-passing result must never award points — this bucket is
        // "we couldn't/didn't run it", not "give the benefit of the doubt".
        points: 0,
        actualOutput: "",
        stderr: null,
        compileOutput: null,
        status: "unsupported_language",
        timeMs: null,
        memoryKb: null,
      }));
    }

    if (!this.isConfigured()) {
      this.logger.warn("JUDGE0_URL is not set — cannot judge coding submissions.");
      return cases.map((c) => ({
        testCaseId: c.id,
        isSample: c.isSample,
        passed: false,
        points: 0,
        actualOutput: "",
        stderr: null,
        compileOutput: null,
        status: "judge_unavailable",
        timeMs: null,
        memoryKb: null,
      }));
    }

    const results: JudgeCaseResult[] = [];
    for (const testCase of cases) {
      results.push(await this.runOne(sourceCode, languageId, timeLimitMs, memoryLimitMb, testCase));
    }
    return results;
  }

  private async runOne(
    sourceCode: string,
    languageId: number,
    timeLimitMs: number,
    memoryLimitMb: number,
    testCase: JudgeCase
  ): Promise<JudgeCaseResult> {
    try {
      const res = await fetch(`${this.baseUrl}/submissions?base64_encoded=false&wait=true`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: languageId,
          stdin: testCase.input,
          cpu_time_limit: timeLimitMs / 1000,
          memory_limit: memoryLimitMb * 1024, // Judge0 wants KB
        }),
      });

      if (!res.ok) {
        this.logger.error(`Judge0 returned ${res.status} for test case ${testCase.id}`);
        return {
          testCaseId: testCase.id,
          isSample: testCase.isSample,
          passed: false,
          points: 0,
          actualOutput: "",
          stderr: null,
          compileOutput: null,
          status: "judge_unavailable",
          timeMs: null,
          memoryKb: null,
        };
      }

      const body = await res.json();
      const statusId: number = body.status?.id ?? 13;
      const stdout = body.stdout ?? "";
      const passed = statusId === 3 && normalizeOutput(stdout) === normalizeOutput(testCase.expectedOutput);

      return {
        testCaseId: testCase.id,
        isSample: testCase.isSample,
        passed,
        points: passed ? testCase.points : 0,
        actualOutput: stdout,
        stderr: body.stderr ?? null,
        compileOutput: body.compile_output ?? null,
        // Judge0's own status id 3 just means "the program ran to
        // completion without crashing/timing out" — it says nothing about
        // whether the output was correct. statusLabel(3) maps to "accepted"
        // for exactly that reason, so falling through to it here for a
        // code-ran-but-output-didn't-match case wrongly relabeled a failed
        // test case as "Passed" (the badge color was still correct, driven
        // by `passed`, but the text next to it lied).
        status: passed ? "accepted" : statusId === 3 ? "wrong_answer" : statusLabel(statusId),
        timeMs: body.time ? Math.round(Number(body.time) * 1000) : null,
        memoryKb: body.memory ? Math.round(Number(body.memory)) : null,
      };
    } catch (err) {
      this.logger.error(`Judge0 request failed for test case ${testCase.id}: ${(err as Error).message}`);
      return {
        testCaseId: testCase.id,
        isSample: testCase.isSample,
        passed: false,
        points: 0,
        actualOutput: "",
        stderr: null,
        compileOutput: null,
        status: "judge_unavailable",
        timeMs: null,
        memoryKb: null,
      };
    }
  }
}
