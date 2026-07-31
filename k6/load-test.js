import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

// Full exam-day flow for 1200 students: login -> start attempt -> answer
// every question -> submit. Data comes from backend/scripts/load-test-data.json,
// produced by `npx ts-node backend/scripts/load-test-seed.ts`.
//
// Run: k6 run -e BASE_URL=https://placement-test-portal-api.onrender.com k6/load-test.js

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const PASSWORD = __ENV.LOAD_TEST_PASSWORD || "LoadTest123!";
// Spreads each VU's start across this many seconds instead of everyone
// hitting login in the same instant — 0 (default) keeps the instant-spike
// behavior. Set e.g. RAMP_SECONDS=60 to simulate students trickling in
// during a launch window rather than a single-millisecond thundering herd.
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 0);

const fixture = new SharedArray("students", function () {
  return JSON.parse(open("../backend/scripts/load-test-data.json")).students;
});
const TEST_ID = JSON.parse(open("../backend/scripts/load-test-data.json")).testId;

export const options = {
  scenarios: {
    exam_day_spike: {
      executor: "per-vu-iterations",
      vus: fixture.length,
      iterations: 1,
      maxDuration: "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  const student = fixture[(__VU - 1) % fixture.length];

  if (RAMP_SECONDS > 0) {
    sleep(((__VU - 1) / fixture.length) * RAMP_SECONDS);
  }

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ identifier: student.rollNo, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" } }
  );
  const loggedIn = check(loginRes, { "login 200": (r) => r.status === 200 });
  if (!loggedIn) return;

  const accessToken = loginRes.json("accessToken");
  const authHeaders = {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  };

  const startRes = http.post(`${BASE_URL}/tests/${TEST_ID}/attempts/start`, null, authHeaders);
  const started = check(startRes, { "start 200/201": (r) => r.status === 200 || r.status === 201 });
  if (!started) return;

  const body = startRes.json();
  const attemptId = body.attempt.id;
  const questions = body.questions;

  for (const q of questions) {
    const selectedOptionId = q.options?.length ? q.options[0].id : undefined;
    const answerRes = http.post(
      `${BASE_URL}/attempts/${attemptId}/answers`,
      JSON.stringify({ questionId: q.id, selectedOptionId }),
      authHeaders
    );
    check(answerRes, { "answer 200/201": (r) => r.status === 200 || r.status === 201 });
    sleep(0.2); // rough per-question think time
  }

  const submitRes = http.post(`${BASE_URL}/attempts/${attemptId}/submit`, null, authHeaders);
  check(submitRes, { "submit 200/201": (r) => r.status === 200 || r.status === 201 });
}
