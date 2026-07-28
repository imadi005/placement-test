import { Injectable } from "@nestjs/common";
import { DraftOption, DraftQuestion } from "./draft-question.types";

// Recognizes the common exam-set shape teachers actually type:
//
//   1. What is the capital of France?
//   A) London
//   B) Paris
//   C) Berlin
//   D) Madrid
//   Answer: B
//
// This is a first-pass heuristic, not a guarantee — every result carries
// `parseWarning` when something looks off (no options found, no marked
// answer, etc.) so the coordinator's review screen can flag it rather than
// silently publishing a broken question. Per system-design/...md §10, NONE
// of this output reaches a live test until a human approves it.
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

    return withoutPreamble.map((chunk, index) => this.parseChunk(chunk.trim(), index + 1));
  }

  private parseChunk(chunk: string, order: number): DraftQuestion {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      return {
        questionText: "",
        questionOrder: order,
        questionType: "descriptive",
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
    if (isMcq && !answerLabel) warnings.push("No answer marked — correct option unknown.");
    if (isMcq && answerLabel && !options.some((o) => o.isCorrect)) {
      warnings.push(`Answer marked "${answerLabel}" but no matching option "${answerLabel}" found.`);
    }

    return {
      questionText,
      questionOrder: order,
      questionType: isMcq ? "mcq" : "descriptive",
      options: isMcq ? options : [],
      modelAnswer: isMcq ? null : null,
      parseWarning: warnings.length > 0 ? warnings.join(" ") : null,
    };
  }
}
