import type { StudentAcademicSummary } from "@/lib/gradeCalculation";

/** Period row for the grid; times as ISO strings for server → client props. */
export type ParentDashboardPeriod = {
  id: string;
  name: string;
  order: number;
  startTime: string;
  endTime: string;
};

/** One child block on the parent home dashboard. */
export type ParentDashboardItem = {
  studentId: string;
  displayName: string;
  schoolName: string;
  classId: number | null;
  schoolId: string;
  summary: StudentAcademicSummary | null;
  periods: ParentDashboardPeriod[];
};
