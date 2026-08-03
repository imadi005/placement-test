export interface DraftOption {
  label: string; // "A" | "B" | "C" | "D"
  text: string;
  isCorrect: boolean;
}

export interface DraftCodingTestCase {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  points: number;
}

export interface DraftFunctionParameter {
  name: string;
  type: string;
}

export interface DraftCodingProblem {
  constraints: string | null;
  timeLimitMs: number;
  memoryLimitMb: number;
  allowedLanguages: string[];
  starterCode: Record<string, string>;
  testCases: DraftCodingTestCase[];
  // LeetCode-style signature the student implements.
  functionName: string;
  parameters: DraftFunctionParameter[];
  returnType: string;
}

export interface DraftQuestion {
  questionText: string;
  questionOrder: number;
  questionType: "mcq" | "descriptive" | "coding";
  options: DraftOption[];
  // Populated only for descriptive questions with no detected options —
  // coordinator fills this in during review if the source doc didn't have it.
  modelAnswer?: string | null;
  // Coding questions only — everything the CodingProblemEditor needs,
  // pre-filled straight from the uploaded document.
  codingProblem?: DraftCodingProblem;
  // Surfaced to the reviewer so a bad parse is obvious at a glance rather
  // than silently accepted — never auto-publish a question flagged here.
  parseWarning?: string | null;
}
