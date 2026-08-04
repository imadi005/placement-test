import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../prisma/prisma.service";

function avg(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Score used for ranking/aggregation — prefer the fully-graded finalScore,
// fall back to the instantly-known mcqScore while descriptive answers are
// still pending_grading, same convention as the student-facing results page.
function scoreOf(a: { finalScore: unknown; mcqScore: unknown }): number | null {
  if (a.finalScore !== null && a.finalScore !== undefined) return Number(a.finalScore);
  if (a.mcqScore !== null && a.mcqScore !== undefined) return Number(a.mcqScore);
  return null;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Single source of truth for a test's analytics — the JSON endpoint and
  // the Excel export both call this so the two never drift apart.
  async getAnalytics(testId: string) {
    const test = await this.prisma.test.findUnique({
      where: { id: testId },
      include: { questions: { include: { options: true }, orderBy: { questionOrder: "asc" } } },
    });
    if (!test) throw new NotFoundException("Test not found");

    const totalEligible = await this.prisma.student.count({
      where: test.batchScope === "ALL" ? {} : { batch: test.batchScope as any },
    });

    const attempts = await this.prisma.testAttempt.findMany({
      where: { testId },
      include: {
        student: { include: { user: { select: { fullName: true } } } },
        answers: { include: { question: true, selectedOption: true } },
        violations: true,
      },
    });

    const maxScore = test.questions.reduce((sum, q) => sum + Number(q.marks), 0);
    const submitted = attempts.filter((a) => a.status !== "in_progress");
    const scores = submitted.map(scoreOf).filter((s): s is number => s !== null);

    const overview = {
      totalEligible,
      totalAttempted: attempts.length,
      totalSubmitted: submitted.length,
      inProgressCount: attempts.length - submitted.length,
      pendingGradingCount: submitted.filter((a) => a.status === "pending_grading").length,
      completionRate: totalEligible ? submitted.length / totalEligible : 0,
      avgScore: avg(scores),
      medianScore: median(scores),
      highScore: scores.length ? Math.max(...scores) : 0,
      lowScore: scores.length ? Math.min(...scores) : 0,
      maxPossibleScore: maxScore,
      avgViolations: avg(attempts.map((a) => a.violations.length)),
      // "flagged" only means "crossed the 5-violation auto-submit
      // threshold" — a student can rack up real violations (tab
      // switches, fullscreen exits) without ever tripping that, so this
      // alone reading 0 was misleading coordinators into thinking nothing
      // happened. studentsWithViolations is the "did anything happen at
      // all" glance-metric; the per-student table still shows the exact
      // count and the flagged badge for whoever did cross the threshold.
      flaggedCount: submitted.filter((a) => a.status === "flagged").length,
      studentsWithViolations: attempts.filter((a) => a.violations.length > 0).length,
    };

    const aggregateGroup = <K extends string>(map: Map<K, typeof submitted>, keyName: string) =>
      [...map.entries()]
        .map(([key, list]) => {
          const s = list.map(scoreOf).filter((x): x is number => x !== null);
          return {
            [keyName]: key,
            attempted: list.length,
            avgScore: avg(s),
            highScore: s.length ? Math.max(...s) : 0,
            lowScore: s.length ? Math.min(...s) : 0,
            avgViolations: avg(list.map((a) => a.violations.length)),
          };
        })
        .sort((a: any, b: any) => String(a[keyName]).localeCompare(String(b[keyName])));

    const byBatch = aggregateGroup(
      groupBy(submitted, (a) => a.student.batch),
      "batch"
    );
    const bySection = aggregateGroup(
      groupBy(submitted, (a) => a.student.section),
      "section"
    );

    const byQuestion = test.questions.map((q) => {
      const answersForQ = submitted.flatMap((a) => a.answers.filter((ans) => ans.questionId === q.id));
      const answeredCount = answersForQ.length;
      const correctCount = answersForQ.filter((ans) => ans.selectedOption?.isCorrect).length;
      return {
        questionId: q.id,
        questionOrder: q.questionOrder,
        questionText: q.questionText,
        maxMarks: Number(q.marks),
        answeredCount,
        correctCount,
        correctPct: answeredCount ? correctCount / answeredCount : 0,
      };
    });

    // 5 equal-width buckets over 0-100% of the test's max possible score.
    const bucketLabels = ["0-20%", "20-40%", "40-60%", "60-80%", "80-100%"];
    const distribution = bucketLabels.map((label) => ({ label, count: 0 }));
    if (maxScore > 0) {
      for (const s of scores) {
        const pct = (s / maxScore) * 100;
        const idx = Math.min(4, Math.max(0, Math.floor(pct / 20)));
        distribution[idx].count++;
      }
    }

    const violationCounts = new Map<string, number>();
    for (const a of attempts) {
      for (const v of a.violations) {
        violationCounts.set(v.type, (violationCounts.get(v.type) ?? 0) + 1);
      }
    }
    const violationsByType = [...violationCounts.entries()].map(([type, count]) => ({ type, count }));

    const students = submitted
      .map((a) => {
        // Kept to the exact second (not rounded to minutes) specifically so
        // the tie-break below can actually distinguish two attempts that
        // both round to the same displayed minute (e.g. 9:50 and 9:04 both
        // show "10 min" / "9 min" if rounded, but the raw seconds are what
        // decide who really finished faster).
        const timeTakenSeconds =
          a.startedAt && a.submittedAt
            ? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)
            : null;
        return {
          attemptId: a.id,
          rollNo: a.student.rollNo,
          fullName: a.student.user.fullName,
          batch: a.student.batch,
          section: a.student.section,
          status: a.status,
          mcqScore: a.mcqScore !== null ? Number(a.mcqScore) : null,
          finalScore: a.finalScore !== null ? Number(a.finalScore) : null,
          violationCount: a.violations.length,
          timeTakenMinutes: timeTakenSeconds !== null ? Math.round(timeTakenSeconds / 60) : null,
          timeTakenSeconds,
        };
      })
      .sort((a, b) => {
        const scoreDiff = (b.finalScore ?? b.mcqScore ?? -1) - (a.finalScore ?? a.mcqScore ?? -1);
        if (scoreDiff !== 0) return scoreDiff;
        // Tie on score — less time taken ranks higher. No-time-recorded
        // (null) sorts after every attempt that does have a time, tie or
        // not, same convention as the leaderboard's own tie-break.
        const aTime = a.timeTakenSeconds ?? Infinity;
        const bTime = b.timeTakenSeconds ?? Infinity;
        return aTime - bTime;
      });

    return {
      test: { id: test.id, title: test.title, batchScope: test.batchScope, maxScore },
      overview,
      byBatch,
      bySection,
      byQuestion,
      distribution,
      violationsByType,
      students,
    };
  }

  async buildWorkbook(testId: string): Promise<{ workbook: ExcelJS.Workbook; data: Awaited<ReturnType<AnalyticsService["getAnalytics"]>> }> {
    const data = await this.getAnalytics(testId);
    return { workbook: this.buildWorkbookFromData(data), data };
  }

  // Mirrors getAnalytics() exactly — same numbers on screen and in the
  // download, always, since both read from the same computed data.
  private buildWorkbookFromData(data: Awaited<ReturnType<AnalyticsService["getAnalytics"]>>): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Placement Test Portal";
    wb.created = new Date();

    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    const headerFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F5C52" },
    };
    const styleHeaderRow = (row: ExcelJS.Row) => {
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.fill = headerFill;
    };

    // --- Overview ---
    const overviewSheet = wb.addWorksheet("Overview");
    overviewSheet.columns = [
      { header: "Metric", key: "metric", width: 32 },
      { header: "Value", key: "value", width: 20 },
    ];
    styleHeaderRow(overviewSheet.getRow(1));
    overviewSheet.addRows([
      { metric: "Test title", value: data.test.title },
      { metric: "Batch scope", value: data.test.batchScope },
      { metric: "Max possible score", value: data.test.maxScore },
      { metric: "Total eligible students", value: data.overview.totalEligible },
      { metric: "Total attempted", value: data.overview.totalAttempted },
      { metric: "Total submitted", value: data.overview.totalSubmitted },
      { metric: "Still in progress", value: data.overview.inProgressCount },
      { metric: "Pending grading", value: data.overview.pendingGradingCount },
      { metric: "Students with violations", value: data.overview.studentsWithViolations },
      { metric: "Auto-submitted (5+ violations)", value: data.overview.flaggedCount },
      { metric: "Completion rate", value: pct(data.overview.completionRate) },
      { metric: "Average score", value: data.overview.avgScore.toFixed(2) },
      { metric: "Median score", value: data.overview.medianScore.toFixed(2) },
      { metric: "High score", value: data.overview.highScore },
      { metric: "Low score", value: data.overview.lowScore },
      { metric: "Average violations per attempt", value: data.overview.avgViolations.toFixed(2) },
    ]);

    // --- By Batch ---
    const batchSheet = wb.addWorksheet("By Batch");
    batchSheet.columns = [
      { header: "Batch", key: "batch", width: 14 },
      { header: "Attempted", key: "attempted", width: 14 },
      { header: "Avg Score", key: "avgScore", width: 14 },
      { header: "High Score", key: "highScore", width: 14 },
      { header: "Low Score", key: "lowScore", width: 14 },
      { header: "Avg Violations", key: "avgViolations", width: 16 },
    ];
    styleHeaderRow(batchSheet.getRow(1));
    for (const row of data.byBatch) {
      batchSheet.addRow({ ...row, avgScore: row.avgScore.toFixed(2), avgViolations: row.avgViolations.toFixed(2) });
    }

    // --- By Section ---
    const sectionSheet = wb.addWorksheet("By Section");
    sectionSheet.columns = [
      { header: "Section", key: "section", width: 16 },
      { header: "Attempted", key: "attempted", width: 14 },
      { header: "Avg Score", key: "avgScore", width: 14 },
      { header: "High Score", key: "highScore", width: 14 },
      { header: "Low Score", key: "lowScore", width: 14 },
      { header: "Avg Violations", key: "avgViolations", width: 16 },
    ];
    styleHeaderRow(sectionSheet.getRow(1));
    for (const row of data.bySection) {
      sectionSheet.addRow({ ...row, avgScore: row.avgScore.toFixed(2), avgViolations: row.avgViolations.toFixed(2) });
    }

    // --- By Question ---
    const questionSheet = wb.addWorksheet("By Question");
    questionSheet.columns = [
      { header: "#", key: "questionOrder", width: 6 },
      { header: "Question", key: "questionText", width: 60 },
      { header: "Max Marks", key: "maxMarks", width: 12 },
      { header: "Answered", key: "answeredCount", width: 12 },
      { header: "Correct %", key: "correctPct", width: 12 },
    ];
    styleHeaderRow(questionSheet.getRow(1));
    for (const q of data.byQuestion) {
      questionSheet.addRow({
        questionOrder: q.questionOrder,
        questionText: q.questionText,
        maxMarks: q.maxMarks,
        answeredCount: q.answeredCount,
        correctPct: pct(q.correctPct),
      });
    }

    // --- Score distribution ---
    const distSheet = wb.addWorksheet("Score Distribution");
    distSheet.columns = [
      { header: "Bracket", key: "label", width: 16 },
      { header: "Students", key: "count", width: 14 },
    ];
    styleHeaderRow(distSheet.getRow(1));
    distSheet.addRows(data.distribution);

    // --- Violations ---
    const violSheet = wb.addWorksheet("Violations");
    violSheet.columns = [
      { header: "Type", key: "type", width: 20 },
      { header: "Count", key: "count", width: 14 },
    ];
    styleHeaderRow(violSheet.getRow(1));
    violSheet.addRows(data.violationsByType.length ? data.violationsByType : [{ type: "None recorded", count: 0 }]);

    // --- Raw per-student data ---
    const studentsSheet = wb.addWorksheet("Students");
    studentsSheet.columns = [
      { header: "Roll No", key: "rollNo", width: 16 },
      { header: "Name", key: "fullName", width: 26 },
      { header: "Batch", key: "batch", width: 10 },
      { header: "Section", key: "section", width: 14 },
      { header: "Status", key: "status", width: 16 },
      { header: "MCQ Score", key: "mcqScore", width: 12 },
      { header: "Final Score", key: "finalScore", width: 12 },
      { header: "Violations", key: "violationCount", width: 12 },
      { header: "Time Taken (min)", key: "timeTakenMinutes", width: 16 },
    ];
    styleHeaderRow(studentsSheet.getRow(1));
    studentsSheet.addRows(data.students);

    for (const sheet of wb.worksheets) {
      sheet.views = [{ state: "frozen", ySplit: 1 }];
    }

    return wb;
  }
}
