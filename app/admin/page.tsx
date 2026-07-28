"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { BatchDistributionCard } from "@/components/admin/BatchDistributionCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface BatchCount {
  batch: string;
  count: number;
}
interface AttendanceSummaryRow {
  classAssignmentId: string;
  section: string;
  subject: string;
  teacherName: string;
  attendancePercentage: number;
}
interface TestRow {
  id: string;
  title: string;
  status: string;
  batchScope: string;
}

// Admin per RBAC matrix §8: view-all — teacher assignments, attendance,
// tests/questions — but never a mutation control on this screen. Every
// fetch here hits an endpoint the backend already scopes to
// coordinator+admin; there is no admin-only write path for any of this.
export default function AdminDashboardPage() {
  const [batches, setBatches] = useState<BatchCount[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummaryRow[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [batchRes, attendanceRes, testsRes] = await Promise.all([
          fetch(`${API_URL}/batches/distribution`, { headers: authHeaders() }),
          fetch(`${API_URL}/attendance/summary`, { headers: authHeaders() }),
          fetch(`${API_URL}/tests`, { headers: authHeaders() }),
        ]);
        if (batchRes.ok) setBatches(await batchRes.json());
        if (attendanceRes.ok) setAttendance(await attendanceRes.json());
        if (testsRes.ok) setTests(await testsRes.json());
      } catch {
        setError("Couldn't reach the server. Is the backend running?");
      }
    }
    load();
  }, []);

  const totalStudents = batches.reduce((sum, b) => sum + b.count, 0);
  const avgAttendance =
    attendance.length > 0
      ? Math.round(attendance.reduce((sum, a) => sum + a.attendancePercentage, 0) / attendance.length)
      : 0;

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6">
        <h1 className="font-serif text-headline-md text-on-surface">Admin overview</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Read-only view across tests, batches, and attendance.
        </p>
      </header>

      {error && <p className="mb-4 text-body-sm text-error">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total students" value={String(totalStudents)} />
        <StatCard label="Avg. attendance" value={`${avgAttendance}%`} />
        <StatCard label="Tests on record" value={String(tests.length)} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <BatchDistributionCard data={batches} />

        <Card>
          <p className="mb-4 text-label-caps text-on-surface-variant">
            Teacher assignments &amp; attendance %
          </p>
          <div className="flex flex-col gap-3">
            {attendance.map((row) => (
              <div key={row.classAssignmentId} className="flex items-center justify-between">
                <div>
                  <p className="text-body-md text-on-surface">
                    {row.subject} · {row.section}
                  </p>
                  <p className="text-body-sm text-on-surface-variant">{row.teacherName}</p>
                </div>
                <span className="font-serif text-xl font-semibold text-on-surface">
                  {row.attendancePercentage}%
                </span>
              </div>
            ))}
            {attendance.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">No attendance recorded yet.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <p className="p-4 text-label-caps text-on-surface-variant">All tests</p>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-outline-variant">
              <th className="p-4 text-label-caps text-on-surface-variant">Title</th>
              <th className="p-4 text-label-caps text-on-surface-variant">Batch scope</th>
              <th className="p-4 text-label-caps text-on-surface-variant">Status</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id} className="border-b border-outline-variant last:border-0">
                <td className="p-4 text-body-md text-on-surface">{t.title}</td>
                <td className="p-4 text-body-sm text-on-surface-variant">{t.batchScope}</td>
                <td className="p-4 text-body-sm text-on-surface-variant">{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
