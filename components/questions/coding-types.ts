// JSON args array (e.g. "[[2,7,11,15], 9]") and JSON return value (e.g.
// "[0,1]") — NOT raw stdin/stdout text. See harness-types.ts on the backend
// for why the type grammar below is deliberately this small.
export interface EditableCodingTestCase {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

export const PARAM_TYPES = ["int", "double", "boolean", "string", "int[]", "double[]", "string[]", "boolean[]"] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

export interface EditableFunctionParameter {
  name: string;
  type: ParamType;
}

export interface EditableCodingProblem {
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: string[];
  starterCode: Record<string, string>;
  testCases: EditableCodingTestCase[];
  // LeetCode-style signature the student implements — starterCode above is
  // now just the function stub per language, not a full program.
  functionName: string;
  parameters: EditableFunctionParameter[];
  returnType: ParamType;
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
    functionName: "",
    parameters: [{ name: "", type: "int" }],
    returnType: "int",
  };
}
