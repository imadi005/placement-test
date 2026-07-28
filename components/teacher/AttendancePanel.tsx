"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface RosterStudent {
  userId: string;
  rollNo: string;
  user: { fullName: string };
}

type Status = "present" | "absent" | "excused";

interface Props {
  classAssignmentId: string;
  onClose: () => void;
}

export function AttendancePanel({ classAssignmentId, onClose }: Props) {
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [date] = useState(() => new Date().toISOString().slice(0, 10));
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch(`${API_URL}/class-assignments/${classAssignmentId}/roster`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data: RosterStudent[] = await res.json();
        setRoster(data);
        setStatuses(Object.fromEntries(data.map((s) => [s.userId, "present" as Status])));
      }
    }
    load();
  }, [classAssignmentId]);

  function toggle(studentId: string, status: Status) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  }

  async function save() {
    setIsSaving(true);
    try {
      const records = Object.entries(statuses).map(([studentId, status]) => ({ studentId, status }));
      const res = await fetch(`${API_URL}/class-assignments/${classAssignmentId}/attendance`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ date, records }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-on-surface/40 px-4">
      <Card className="w-full max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-headline-md text-on-surface">Mark attendance</h2>
          <button onClick={onClose} className="text-body-sm text-on-surface-variant">
            Close
          </button>
        </div>
        <p className="mb-4 text-body-sm text-on-surface-variant">Date: {date}</p>

        <div className="max-h-96 overflow-y-auto">
          {roster.map((student) => (
            <div
              key={student.userId}
              className="flex items-center justify-between border-b border-outline-variant py-3 last:border-0"
            >
              <div>
                <p className="text-body-md text-on-surface">{student.user.fullName}</p>
                <p className="text-body-sm text-on-surface-variant">{student.rollNo}</p>
              </div>
              <div className="flex gap-1">
                {(["present", "absent", "excused"] as Status[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => toggle(student.userId, status)}
                    className={`rounded-full px-3 py-1 text-body-sm capitalize ${
                      statuses[student.userId] === status
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {roster.length === 0 && (
            <p className="py-6 text-center text-body-sm text-on-surface-variant">
              No students found for this section.
            </p>
          )}
        </div>

        {saved ? (
          <p className="mt-4 text-center text-body-sm text-secondary">Attendance saved.</p>
        ) : (
          <Button className="mt-4 w-full" onClick={save} disabled={isSaving || roster.length === 0}>
            {isSaving ? "Saving…" : "Save attendance"}
          </Button>
        )}
      </Card>
    </div>
  );
}
