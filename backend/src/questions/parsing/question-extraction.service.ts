import { Injectable } from "@nestjs/common";
import { DraftCodingTestCase, DraftFunctionParameter, DraftOption, DraftQuestion } from "./draft-question.types";

const LANG_ALIASES: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cplusplus: "cpp",
  java: "java",
  python: "python",
  py: "python",
};

function normalizeLang(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return LANG_ALIASES[key] ?? null;
}

// Recognizes two question shapes in the same uploaded document:
//
// MCQ (unchanged):
//   1. What is the capital of France?
//   A) London
//   B) Paris
//   Answer: B
//
// Coding (a plain-text/markdown convention, deliberately NOT prose guessing,
// so a coordinator gets the exact same result every time they upload the
// same file) — LeetCode-style: the student implements FUNCTION only, and
// SAMPLE/HIDDEN INPUT/OUTPUT are JSON literals (args array / return value),
// not raw stdin/stdout text:
//   2. [CODING]
//   STATEMENT:
//   Given an array of integers nums and a target, return the indices of
//   the two numbers that add up to target.
//   CONSTRAINTS:
//   2 <= nums.length <= 1000
//   LANGUAGES: c, cpp, java, python
//   FUNCTION: twoSum
//   PARAMETERS:
//   nums: int[]
//   target: int
//   RETURNS: int[]
//   SAMPLE INPUT 1:
//   [[2,7,11,15], 9]
//   SAMPLE OUTPUT 1:
//   [0,1]
//   HIDDEN INPUT 1:
//   [[3,2,4], 6]
//   HIDDEN OUTPUT 1:
//   [1,2]
//   STARTER PYTHON:
//   def twoSum(nums, target):
//       pass
//
// This is a first-pass heuristic, not a guarantee — every result carries
// `parseWarning` when something looks off (no options/test cases found, no
// marked answer, etc.) so the coordinator's review screen can flag it
// rather than silently publishing a broken question. Per
// system-design/...md §10, NONE of this output reaches a live test until a
// human approves it.
@Injectable()
export class QuestionExtractionService {
  extract(rawText: string): DraftQuestion[] {
    const normalized = rawText.replace(/\r\n/g, "\n").trim();

    // Split on a line that starts a new numbered question: "1.", "Q1.", "12)"
    const questionBoundary = /\n(?=(?:Q?\.?\s*)?\d{1,3}[.)]\s+\S)/g;
    const chunks = normalized.split(questionBoundary).filter((c) => c.trim().length > 0);

    // The split above only guarantees chunks AFTER the first boundary start
    // with a number — text before the very first numbered question (a
    // title, "Set by: ..." line, instructions) ends up as chunks[0] and
    // would otherwise get misread as a bogus "question 1". Drop it here
    // rather than surfacing it as a fake question in the review UI.
    const numberedChunkPattern = /^(?:Q?\.?\s*)?\d{1,3}[.)]\s+\S/;
    const withoutPreamble =
      chunks.length > 0 && !numberedChunkPattern.test(chunks[0].trim()) ? chunks.slice(1) : chunks;

    return withoutPreamble.map((chunk, index) => this.parseAnyChunk(chunk, index + 1));
  }

  private parseAnyChunk(chunk: string, order: number): DraftQuestion {
    const firstLineEnd = chunk.indexOf("\n");
    const firstLine = (firstLineEnd === -1 ? chunk : chunk.slice(0, firstLineEnd)).trim();
    const firstLineAfterNumber = firstLine.replace(/^Q?\.?\s*\d{1,3}[.)]\s*/i, "").trim();

    if (/^\[CODING\]/i.test(firstLineAfterNumber)) {
      const rest = firstLineEnd === -1 ? "" : chunk.slice(firstLineEnd + 1);
      return this.parseCodingChunk(rest, order);
    }
    return this.parseMcqChunk(chunk, order);
  }

  private parseMcqChunk(chunk: string, order: number): DraftQuestion {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return {
        questionText: "",
        questionOrder: order,
        questionType: "mcq",
        options: [],
        parseWarning: "Empty chunk — nothing to parse. Remove or fill in manually.",
      };
    }

    // First line, stripped of its leading number, is the question text.
    // Question text can wrap onto following lines until an option/answer
    // line starts.
    const optionLinePattern = /^([A-D])[.)]\s*(.+)$/i;
    const answerLinePattern = /^(answer|ans)\s*[:.]?\s*([A-D])/i;

    let questionTextLines: string[] = [];
    const options: DraftOption[] = [];
    let answerLabel: string | null = null;
    let i = 0;

    // First line: strip leading "1." / "Q1)" numbering
    const firstLine = lines[0].replace(/^Q?\.?\s*\d{1,3}[.)]\s*/i, "");
    questionTextLines.push(firstLine);
    i = 1;

    for (; i < lines.length; i++) {
      const line = lines[i];
      const optionMatch = line.match(optionLinePattern);
      const answerMatch = line.match(answerLinePattern);

      if (answerMatch) {
        answerLabel = answerMatch[2].toUpperCase();
      } else if (optionMatch) {
        options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim(), isCorrect: false });
      } else if (options.length === 0) {
        // Still part of the question text (wrapped line before any option starts)
        questionTextLines.push(line);
      }
      // Lines after options/answer that don't match anything are ignored —
      // usually trailing whitespace or a stray marks annotation.
    }

    if (answerLabel) {
      const matchedOption = options.find((o) => o.label === answerLabel);
      if (matchedOption) matchedOption.isCorrect = true;
    }

    const questionText = questionTextLines.join(" ").trim();
    const isMcq = options.length >= 2;
    const warnings: string[] = [];

    if (!questionText) warnings.push("No question text detected.");
    if (!isMcq) warnings.push("Couldn't detect at least two answer options — add them manually.");
    if (isMcq && !answerLabel) warnings.push("No answer marked — correct option unknown.");
    if (isMcq && answerLabel && !options.some((o) => o.isCorrect)) {
      warnings.push(`Answer marked "${answerLabel}" but no matching option "${answerLabel}" found.`);
    }

    // Every non-coding question is MCQ — a chunk with no detected options
    // still comes back as "mcq" with an empty option list, flagged for the
    // coordinator to fill in on the review screen, never as a different
    // question type.
    return {
      questionText,
      questionOrder: order,
      questionType: "mcq",
      options,
      modelAnswer: null,
      parseWarning: warnings.length > 0 ? warnings.join(" ") : null,
    };
  }

  // --- Coding question section parser -----------------------------------
  //
  // A small line-scanning state machine, not a giant regex — each KNOWN
  // header line closes the previous section and opens the next one;
  // everything in between is that section's raw content, whitespace
  // preserved (code and test-case input/output both care about exact
  // formatting).
  private parseCodingChunk(body: string, order: number): DraftQuestion {
    const lines = body.replace(/\r\n/g, "\n").split("\n");

    const HEADER_PATTERNS: Array<{ re: RegExp; kind: string }> = [
      { re: /^STATEMENT\s*:\s*$/i, kind: "statement" },
      { re: /^CONSTRAINTS\s*:\s*$/i, kind: "constraints" },
      { re: /^LANGUAGES\s*:\s*(.*)$/i, kind: "languages" },
      { re: /^FUNCTION\s*:\s*(.*)$/i, kind: "function" },
      { re: /^PARAMETERS\s*:\s*$/i, kind: "parameters" },
      { re: /^RETURNS\s*:\s*(.*)$/i, kind: "returns" },
      { re: /^SAMPLE\s+INPUT\s+(\d+)\s*:\s*$/i, kind: "sample_input" },
      { re: /^SAMPLE\s+OUTPUT\s+(\d+)\s*:\s*$/i, kind: "sample_output" },
      { re: /^HIDDEN\s+INPUT\s+(\d+)\s*:\s*$/i, kind: "hidden_input" },
      { re: /^HIDDEN\s+OUTPUT\s+(\d+)\s*:\s*$/i, kind: "hidden_output" },
      { re: /^STARTER\s+([A-Za-z+]+)\s*:\s*$/i, kind: "starter" },
    ];
    // Headers whose value is on the SAME line ("LANGUAGES: c, cpp") rather
    // than a multi-line block below it ("STATEMENT:\n...").
    const INLINE_KINDS = new Set(["languages", "function", "returns"]);

    type Section = { kind: string; key?: string; lines: string[] };
    const sections: Section[] = [];
    let current: Section | null = null;
    const inlineValues: Record<string, string | null> = {};

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      let matched = false;
      for (const { re, kind } of HEADER_PATTERNS) {
        const m = trimmed.match(re);
        if (!m) continue;
        matched = true;
        if (current) sections.push(current);
        if (INLINE_KINDS.has(kind)) {
          inlineValues[kind] = m[1]?.trim() || null;
          current = null;
        } else {
          current = { kind, key: m[1], lines: [] };
        }
        break;
      }
      if (!matched && current) current.lines.push(rawLine);
    }
    if (current) sections.push(current);
    const languagesInlineValue = inlineValues.languages ?? null;

    const trimBlock = (arr: string[]) => arr.join("\n").replace(/^\n+|\n+$/g, "");

    const statement = trimBlock(sections.find((s) => s.kind === "statement")?.lines ?? []);
    const constraints = sections.find((s) => s.kind === "constraints");
    const starterSections = sections.filter((s) => s.kind === "starter");

    const starterCode: Record<string, string> = {};
    const unrecognizedLangs: string[] = [];
    for (const s of starterSections) {
      const langId = s.key ? normalizeLang(s.key) : null;
      if (!langId) {
        if (s.key) unrecognizedLangs.push(s.key);
        continue;
      }
      starterCode[langId] = trimBlock(s.lines);
    }

    let allowedLanguages: string[];
    if (languagesInlineValue) {
      allowedLanguages = languagesInlineValue
        .split(",")
        .map((l) => normalizeLang(l))
        .filter((l): l is string => Boolean(l));
    } else {
      allowedLanguages = Object.keys(starterCode);
    }

    const buildCases = (inputKind: string, outputKind: string, isSample: boolean): DraftCodingTestCase[] => {
      const inputs = new Map(sections.filter((s) => s.kind === inputKind).map((s) => [s.key, s]));
      const outputs = new Map(sections.filter((s) => s.kind === outputKind).map((s) => [s.key, s]));
      const cases: DraftCodingTestCase[] = [];
      const keys = [...new Set([...inputs.keys(), ...outputs.keys()])].sort(
        (a, b) => Number(a) - Number(b)
      );
      for (const key of keys) {
        const inputSection = inputs.get(key);
        const outputSection = outputs.get(key);
        cases.push({
          input: inputSection ? trimBlock(inputSection.lines) : "",
          expectedOutput: outputSection ? trimBlock(outputSection.lines) : "",
          isSample,
          points: 1,
        });
      }
      return cases;
    };

    const testCases = [
      ...buildCases("sample_input", "sample_output", true),
      ...buildCases("hidden_input", "hidden_output", false),
    ];

    // PARAMETERS: one "name: type" per line, e.g. "nums: int[]".
    const PARAM_TYPES = new Set(["int", "double", "boolean", "string", "int[]", "double[]", "string[]", "boolean[]"]);
    const parametersSection = sections.find((s) => s.kind === "parameters");
    const parameters: DraftFunctionParameter[] = [];
    const badParamLines: string[] = [];
    for (const rawLine of parametersSection?.lines ?? []) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(\S+)$/);
      if (!m || !PARAM_TYPES.has(m[2])) {
        badParamLines.push(line);
        continue;
      }
      parameters.push({ name: m[1], type: m[2] });
    }

    const functionName = inlineValues.function ?? "";
    const returnType = inlineValues.returns ?? "";

    const warnings: string[] = [];
    if (!statement) warnings.push("No STATEMENT section detected.");
    if (allowedLanguages.length === 0) warnings.push("No languages detected — add LANGUAGES or STARTER sections.");
    if (unrecognizedLangs.length > 0) {
      warnings.push(`Unrecognized language(s) in STARTER sections: ${unrecognizedLangs.join(", ")}.`);
    }
    if (!testCases.some((tc) => tc.isSample)) warnings.push("No sample test cases detected — add at least one.");
    if (testCases.some((tc) => !tc.input && !tc.expectedOutput)) {
      warnings.push("A test case is missing its input or expected output.");
    }
    if (!functionName) warnings.push("No FUNCTION section detected.");
    if (parameters.length === 0) warnings.push("No PARAMETERS detected — add at least one (e.g. \"nums: int[]\").");
    if (badParamLines.length > 0) {
      warnings.push(`Couldn't parse PARAMETERS line(s): ${badParamLines.join(", ")}.`);
    }
    if (!returnType) warnings.push("No RETURNS section detected.");
    else if (!PARAM_TYPES.has(returnType)) warnings.push(`Unrecognized RETURNS type "${returnType}".`);

    return {
      questionText: statement,
      questionOrder: order,
      questionType: "coding",
      options: [],
      codingProblem: {
        constraints: constraints ? trimBlock(constraints.lines) || null : null,
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        allowedLanguages,
        starterCode,
        testCases,
        functionName,
        parameters,
        returnType,
      },
      parseWarning: warnings.length > 0 ? warnings.join(" ") : null,
    };
  }
}
