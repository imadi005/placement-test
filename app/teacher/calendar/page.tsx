"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { AttendancePanel } from "@/components/teacher/AttendancePanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}` };
}

interface ClassAssignment {
  id: string;
  section: string;
  subject: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export default function TeacherCalendarPage() {
  const [assignments, setAssignments] = useState<ClassAssignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API_URL}/class-assignments/me`, { headers: authHeaders() });
      if (res.ok) setAssignments(await res.json());
    }
    load();
  }, []);

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-gutter">
      <header className="mb-6">
        <h1 className="font-serif text-headline-md text-on-surface">Your calendar</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Click a class to mark today's attendance.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
        {DAY_LABELS.map((label, dayIndex) => {
          const dayAssignments = assignments
            .filter((a) => a.dayOfWeek === dayIndex)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <div key={label}>
              <p className="mb-2 text-label-caps text-on-surface-variant">{label}</p>
              <div className="flex flex-col gap-2">
                {dayAssignments.map((a) => (
                  <Card
                    key={a.id}
                    interactive
                    className="p-3"
                    onClick={() => setSelectedId(a.id)}
                  >
                    <p className="text-body-sm font-medium text-on-surface">{a.subject}</p>
                    <p className="text-label-caps text-on-surface-variant">{a.section}</p>
                    <p className="mt-1 text-body-sm text-on-surface-variant">
                      {a.startTime}–{a.endTime}
                    </p>
                  </Card>
                ))}
                {dayAssignments.length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedId && (
        <AttendancePanel classAssignmentId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </main>
  );
}
