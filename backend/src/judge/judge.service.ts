import { Injectable, Logger } from "@nestjs/common";
import { HarnessBuilderService } from "./harness/harness-builder.service";
import { FunctionSignature } from "./harness/harness-types";

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

// Structural JSON comparison, not string equality — the harness prints the
// student's function's return value as JSON, so "[0, 1]" and "[0,1]" (or any
// other equivalent formatting) must compare equal; only the actual VALUE
// should matter, same as a real LeetCode-style judge.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    // Coding problems are rarely about float precision — a tiny epsilon
    // avoids a correct double-returning solution failing on rounding noise.
    return Math.abs(a - b) < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

// Returns null if `raw` isn't valid JSON at all (a genuine parse failure —
// e.g. the program crashed before printing anything) rather than throwing,
// so a malformed/empty stdout cleanly becomes "wrong answer" instead of an
// unhandled exception.
function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw.trim()) };
  } catch {
    return { ok: false };
  }
}

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);
  private readonly baseUrl = process.env.JUDGE0_URL;
  private readonly authToken = process.env.JUDGE0_AUTH_TOKEN;

  constructor(private harnessBuilder: HarnessBuilderService) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) headers["X-Auth-Token"] = this.authToken;
    return headers;
  }

  // Runs one submission against every given test case concurrently. Judge0
  // already queues submissions past its own worker capacity (Redis-backed),
  // so firing them all at once doesn't overload it any more than sending
  // them one at a time does — it just stops OUR sequential round-trips
  // from stacking latency on top of Judge0's own queue wait. A load test
  // (100 students x 50 coding questions, sequential) took 5+ minutes per
  // submission; concurrent requests let Judge0's queue be the only
  // bottleneck instead of also paying our own network round-trip N times.
  //
  // `signature` describes the function the student implements (LeetCode
  // style) — the student's `sourceCode` is just the function itself; the
  // harness builder wraps it with driver code that reads a test case's JSON
  // args from stdin, calls the function, and prints the return value as
  // JSON (see backend/src/judge/harness/).
  async runAgainstCases(
    sourceCode: string,
    language: string,
    timeLimitMs: number,
    memoryLimitMb: number,
    cases: JudgeCase[],
    signature: FunctionSignature
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

    let wrappedSource: string;
    try {
      wrappedSource = this.harnessBuilder.build(language, signature, sourceCode);
    } catch (err) {
      this.logger.error(`Harness build failed: ${(err as Error).message}`);
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

    return Promise.all(cases.map((testCase) => this.runOne(wrappedSource, languageId, timeLimitMs, memoryLimitMb, testCase)));
  }

  private async runOne(
    sourceCode: string,
    languageId: number,
    timeLimitMs: number,
    memoryLimitMb: number,
    testCase: JudgeCase
  ): Promise<JudgeCaseResult> {
    try {
      // base64_encoded=true, not false — the harness-generated source can
      // trip Judge0's own UTF-8 validation on the plain-text path (seen with
      // a real C++ harness during testing: HTTP 200 with a
      // `{error: "...cannot be converted to UTF-8..."}` body instead of the
      // usual `{status, stdout, ...}` shape, which silently defaulted to
      // "internal_error" below since nothing checked for it). Base64
      // sidesteps that class of encoding issue entirely, per Judge0's own
      // suggested fix.
      const res = await fetch(`${this.baseUrl}/submissions?base64_encoded=true&wait=true`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          source_code: Buffer.from(sourceCode, "utf-8").toString("base64"),
          language_id: languageId,
          // The test case's `input` is already the JSON args array literal
          // (e.g. "[[2,7,11,15], 9]") — the harness reads stdin and
          // JSON.parses it directly, no transformation needed here.
          stdin: Buffer.from(testCase.input, "utf-8").toString("base64"),
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
      if (body.error) {
        // Judge0 returns 200 with this shape (not the usual {status, stdout,
        // ...}) for a handful of request-level failures — surface it loudly
        // instead of silently falling through to a bare "internal_error".
        this.logger.error(`Judge0 rejected the submission for test case ${testCase.id}: ${body.error}`);
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
      const decode = (b64: string | null | undefined) => (b64 ? Buffer.from(b64, "base64").toString("utf-8") : null);
      const statusId: number = body.status?.id ?? 13;
      const stdout = decode(body.stdout) ?? "";
      const actual = tryParseJson(stdout);
      const expected = tryParseJson(testCase.expectedOutput);
      const passed =
        statusId === 3 && actual.ok && expected.ok && deepEqual(actual.value, expected.value);

      return {
        testCaseId: testCase.id,
        isSample: testCase.isSample,
        passed,
        points: passed ? testCase.points : 0,
        actualOutput: stdout,
        stderr: decode(body.stderr),
        compileOutput: decode(body.compile_output),
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
