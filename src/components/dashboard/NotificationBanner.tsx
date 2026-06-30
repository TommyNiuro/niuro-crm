"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Clock, ArrowRight } from "lucide-react";

interface FollowUpData {
  overdue: unknown[];
  today: unknown[];
  upcoming: unknown[];
  unscheduled: unknown[];
}

export function NotificationBanner() {
  const [data, setData] = useState<FollowUpData | null>(null);

  useEffect(() => {
    fetch("/api/followups")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) return null;

  const overdueCount = data.overdue.length;
  const todayCount = data.today.length;

  if (overdueCount === 0 && todayCount === 0) return null;

  return (
    <div className="space-y-2">
      {overdueCount > 0 && (
        <Link href="/activities" className="block">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 hover:bg-destructive/15 transition-colors cursor-pointer">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                {overdueCount} seguimiento{overdueCount > 1 ? "s" : ""} vencido{overdueCount > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-destructive/80">
                Requieren atencion inmediata
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-destructive/70" />
          </div>
        </Link>
      )}

      {todayCount > 0 && (
        <Link href="/activities" className="block">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30 hover:bg-warning/15 transition-colors cursor-pointer">
            <Clock className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning">
                {todayCount} seguimiento{todayCount > 1 ? "s" : ""} para hoy
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-warning/70" />
          </div>
        </Link>
      )}
    </div>
  );
}
