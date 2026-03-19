import prisma from './prisma';

export interface SubjectGrade {
  subjectId: number;
  subjectName: string;
  coefficient: number;
  assessments: {
    id: number;
    title: string;
    type: 'exam' | 'assignment';
    score: number;
    maxScore: number;
    weight: number;
    percentage: number;
  }[];
  weightedAverage: number;
  isPassing: boolean;
}

export interface StudentAcademicSummary {
  studentId: string;
  studentName: string;
  subjectGrades: SubjectGrade[];
  overallAverage: number;
  totalCoefficients: number;
  attendanceRate: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalSessions: number;
  failedSubjectCount: number;
  rank?: number;
  gradeBand?: {
    label: string;
    abbreviation: string | null;
    color: string | null;
    isPassing: boolean;
  };
}

export async function getStudentAcademicSummary(
  studentId: string,
  academicYearId: string,
  schoolId: string
): Promise<StudentAcademicSummary | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId, schoolId },
    select: { id: true, name: true, surname: true, gradeId: true, classId: true },
  });

  if (!student || !student.gradeId) return null;

  const curricula = await prisma.curriculum.findMany({
    where: { academicYearId, gradeId: student.gradeId, schoolId },
    include: { subject: { select: { id: true, name: true } } },
  });

  const results = await prisma.result.findMany({
    where: {
      studentId,
      schoolId,
      OR: [
        { exam: { lesson: { class: { academicYearId } } } },
        { assignment: { lesson: { class: { academicYearId } } } },
      ],
    },
    include: {
      exam: { select: { id: true, title: true, maxScore: true, weight: true, lessonId: true, lesson: { select: { subjectId: true } } } },
      assignment: { select: { id: true, title: true, maxScore: true, weight: true, lessonId: true, lesson: { select: { subjectId: true } } } },
    },
  });

  const subjectGrades: SubjectGrade[] = [];
  let totalWeightedSum = 0;
  let totalCoefficients = 0;
  let failedSubjectCount = 0;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { gradingScale: true },
  });
  const passingThreshold = (school?.gradingScale ?? 100) * 0.5;

  for (const curriculum of curricula) {
    const subjectResults = results.filter(r => {
      const subjectId = r.exam?.lesson?.subjectId ?? r.assignment?.lesson?.subjectId;
      return subjectId === curriculum.subjectId;
    });

    const assessments = subjectResults.map(r => {
      const isExam = !!r.exam;
      const item = isExam ? r.exam! : r.assignment!;
      const maxScore = item.maxScore || 100;
      const weight = item.weight || 1.0;
      const percentage = maxScore > 0 ? (r.score / maxScore) * 100 : 0;

      return {
        id: item.id,
        title: item.title,
        type: (isExam ? 'exam' : 'assignment') as 'exam' | 'assignment',
        score: r.score,
        maxScore,
        weight,
        percentage,
      };
    });

    let weightedAverage = 0;
    const totalWeight = assessments.reduce((sum, a) => sum + a.weight, 0);
    if (totalWeight > 0) {
      weightedAverage = assessments.reduce((sum, a) => sum + a.percentage * a.weight, 0) / totalWeight;
    }

    const isPassing = weightedAverage >= 50;
    if (!isPassing && assessments.length > 0) {
      failedSubjectCount++;
    }

    subjectGrades.push({
      subjectId: curriculum.subjectId,
      subjectName: curriculum.subject.name,
      coefficient: curriculum.coefficient,
      assessments,
      weightedAverage,
      isPassing,
    });

    if (assessments.length > 0) {
      totalWeightedSum += weightedAverage * curriculum.coefficient;
      totalCoefficients += curriculum.coefficient;
    }
  }

  const overallAverage = totalCoefficients > 0 ? totalWeightedSum / totalCoefficients : 0;

  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      studentId,
      schoolId,
      lesson: { class: { academicYearId } },
    },
    select: { status: true },
  });

  const totalSessions = attendanceRecords.length;
  const totalPresent = attendanceRecords.filter(a => a.status === 'PRESENT').length;
  const totalAbsent = attendanceRecords.filter(a => a.status === 'ABSENT').length;
  const totalLate = attendanceRecords.filter(a => a.status === 'LATE').length;
  const attendanceRate = totalSessions > 0 ? (totalPresent / totalSessions) * 100 : 100;

  let gradeBand: StudentAcademicSummary['gradeBand'] = undefined;
  const gradingScaleRecord = await prisma.gradingScale.findFirst({
    where: { schoolId, isDefault: true },
    include: { bands: { orderBy: { order: 'asc' } } },
  });

  if (gradingScaleRecord && gradingScaleRecord.bands.length > 0) {
    const matchingBand = gradingScaleRecord.bands.find(
      b => overallAverage >= b.minPercentage && overallAverage <= b.maxPercentage
    );
    if (matchingBand) {
      gradeBand = {
        label: matchingBand.label,
        abbreviation: matchingBand.abbreviation,
        color: matchingBand.color,
        isPassing: matchingBand.isPassing,
      };
    }
  }

  return {
    studentId: student.id,
    studentName: `${student.name} ${student.surname}`,
    subjectGrades,
    overallAverage,
    totalCoefficients,
    attendanceRate,
    totalPresent,
    totalAbsent,
    totalLate,
    totalSessions,
    failedSubjectCount,
    gradeBand,
  };
}

export async function getClassAcademicSummary(
  classId: number,
  academicYearId: string,
  schoolId: string
): Promise<StudentAcademicSummary[]> {
  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    select: { id: true },
  });

  const summaries: StudentAcademicSummary[] = [];

  for (const student of students) {
    const summary = await getStudentAcademicSummary(student.id, academicYearId, schoolId);
    if (summary) summaries.push(summary);
  }

  summaries.sort((a, b) => b.overallAverage - a.overallAverage);
  summaries.forEach((s, i) => { s.rank = i + 1; });

  return summaries;
}

export function formatScore(
  rawPercentage: number,
  gradingScale: { maxScore: number; bands?: { label: string; minPercentage: number; maxPercentage: number }[] }
): string {
  const scaledScore = (rawPercentage / 100) * gradingScale.maxScore;
  const rounded = Math.round(scaledScore * 100) / 100;

  if (gradingScale.bands && gradingScale.bands.length > 0) {
    const band = gradingScale.bands.find(
      b => rawPercentage >= b.minPercentage && rawPercentage <= b.maxPercentage
    );
    if (band) {
      return `${rounded}/${gradingScale.maxScore} (${band.label})`;
    }
  }

  return `${rounded}/${gradingScale.maxScore}`;
}
