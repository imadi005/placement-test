export interface EditableCodingTestCase {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

export interface EditableCodingProblem {
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: string[];
  starterCode: Record<string, string>;
  testCases: EditableCodingTestCase[];
}

// Judge0 language slugs — keep this the one place that knows the supported
// set so the coordinator's checkboxes, the student's language picker, and
// the backend DTO's @IsIn never drift apart.
export const CODING_LANGUAGES = [
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
] as const;

export function defaultCodingProblem(): EditableCodingProblem {
  return {
    constraints: "",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    allowedLanguages: ["python"],
    starterCode: {},
    testCases: [{ input: "", expectedOutput: "", isSample: true, points: 1 }],
  };
}
