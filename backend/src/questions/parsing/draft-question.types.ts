export interface DraftOption {
  label: string; // "A" | "B" | "C" | "D"
  text: string;
  isCorrect: boolean;
}

export interface DraftQuestion {
  questionText: string;
  questionOrder: number;
  questionType: "mcq" | "descriptive";
  options: DraftOption[];
  // Populated only for descriptive questions with no detected options —
  // coordinator fills this in during review if the source doc didn't have it.
  modelAnswer?: string | null;
  // Surfaced to the reviewer so a bad parse is obvious at a glance rather
  // than silently accepted — never auto-publish a question flagged here.
  parseWarning?: string | null;
}
