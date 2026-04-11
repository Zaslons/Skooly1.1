type TemporalYear = {
  id: string;
  name: string;
  startDate: Date | string;
  endDate: Date | string;
  isActive: boolean;
  isArchived: boolean;
  terms?: TemporalTerm[];
};

type TemporalTerm = {
  id: string;
  name?: string;
  startDate: Date | string;
  endDate: Date | string;
  isArchived: boolean;
};

export type AutomationSummary = {
  activeAcademicYear: { id: string; name: string; startDate: Date | string; endDate: Date | string } | null;
  activeTerm: { id: string; name: string; startDate: Date | string; endDate: Date | string } | null;
  nextAcademicYear: { id: string; name: string; startDate: Date | string; endDate: Date | string } | null;
};

export function buildAutomationSummary(academicYears: TemporalYear[]): AutomationSummary {
  const now = new Date();
  const activeYear =
    academicYears.find((ay) => {
      if (ay.isArchived) return false;
      const start = new Date(ay.startDate);
      const end = new Date(ay.endDate);
      return start <= now && end >= now;
    }) ?? null;

  const activeTerm =
    activeYear?.terms?.find((term) => {
      if (term.isArchived) return false;
      const start = new Date(term.startDate);
      const end = new Date(term.endDate);
      return start <= now && end >= now;
    }) ?? null;

  const referenceEndDate = activeYear ? new Date(activeYear.endDate) : now;
  const upcomingYears = academicYears
    .filter((ay) => !ay.isArchived && new Date(ay.startDate) > referenceEndDate)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const nextYear = upcomingYears[0] ?? null;

  return {
    activeAcademicYear: activeYear
      ? { id: activeYear.id, name: activeYear.name, startDate: activeYear.startDate, endDate: activeYear.endDate }
      : null,
    activeTerm: activeTerm
      ? { id: activeTerm.id, name: activeTerm.name ?? "Current Term", startDate: activeTerm.startDate, endDate: activeTerm.endDate }
      : null,
    nextAcademicYear: nextYear
      ? { id: nextYear.id, name: nextYear.name, startDate: nextYear.startDate, endDate: nextYear.endDate }
      : null,
  };
}
