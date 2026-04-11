import {
  Day,
  ExamCategory,
  LessonDeliveryMode,
  PrismaClient,
  UserSex,
  BillingCycle,
  SubscriptionStatus,
  AttendanceStatus,
  AccountType,
  EnrollmentStatus,
  JoinCodeType,
  CalendarExceptionType,
  MarketplaceInvitationStatus,
  EngagementStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COMMON_PASSWORD = "Password123!";

async function backfillAssignmentDueLessonLinks() {
  const unresolved = await prisma.assignment.findMany({
    where: { dueLessonId: null },
    select: { id: true, schoolId: true, lessonId: true, dueDate: true },
  });

  let linked = 0;
  let fallback = 0;

  for (const assignment of unresolved) {
    let resolvedDueLessonId: number | null = assignment.lessonId ?? null;

    if (!resolvedDueLessonId) {
      const nearest = await prisma.lesson.findFirst({
        where: { schoolId: assignment.schoolId },
        orderBy: {
          startTime: assignment.dueDate >= new Date() ? "asc" : "desc",
        },
        select: { id: true },
      });
      resolvedDueLessonId = nearest?.id ?? null;
    }

    if (resolvedDueLessonId) {
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { dueLessonId: resolvedDueLessonId },
      });
      linked++;
    } else {
      // Keep dueDate as fallback source of truth for unresolved legacy rows.
      fallback++;
      console.warn(
        `[E1 backfill] Assignment ${assignment.id} unresolved: kept legacy dueDate fallback`
      );
    }
  }

  console.log(
    `[E1 backfill] dueLessonId backfill complete: linked=${linked}, unresolved=${fallback}`
  );
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomScore(maxScore: number): number {
  const base = maxScore * 0.3;
  return Math.round((base + Math.random() * (maxScore - base)) * 100) / 100;
}

const FIRST_NAMES_M = ["James", "Noah", "Liam", "Oliver", "Ethan", "Lucas", "Mason", "Logan", "Jack", "Aiden", "Leo", "Samuel", "Henry", "Benjamin", "Daniel", "Matthew", "David", "Joseph", "Carter", "Owen"];
const FIRST_NAMES_F = ["Emma", "Olivia", "Ava", "Sophia", "Mia", "Isabella", "Charlotte", "Amelia", "Harper", "Evelyn", "Luna", "Ella", "Grace", "Chloe", "Lily", "Aria", "Zoey", "Layla", "Nora", "Riley"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Wilson", "Anderson", "Taylor", "Thomas", "Jackson", "White", "Harris", "Martin", "Clark", "Lewis"];

function randomName(sex: UserSex) {
  const first = sex === UserSex.MALE ? randomFrom(FIRST_NAMES_M) : randomFrom(FIRST_NAMES_F);
  const last = randomFrom(LAST_NAMES);
  return { first, last };
}

/** JS getDay(): 0=Sun … 6=Sat — must match Prisma `Day` enum weekday. */
const PRISMA_DAY_TO_JS: Record<Day, number> = {
  [Day.SUNDAY]: 0,
  [Day.MONDAY]: 1,
  [Day.TUESDAY]: 2,
  [Day.WEDNESDAY]: 3,
  [Day.THURSDAY]: 4,
  [Day.FRIDAY]: 5,
  [Day.SATURDAY]: 6,
};

function combineCalendarDayWithTemplateClock(calendarDay: Date, templateClock: Date): Date {
  const out = new Date(calendarDay);
  out.setHours(
    templateClock.getHours(),
    templateClock.getMinutes(),
    templateClock.getSeconds(),
    templateClock.getMilliseconds()
  );
  return out;
}

function firstCalendarDateOnOrAfter(start: Date, end: Date, day: Day): Date | null {
  const target = PRISMA_DAY_TO_JS[day];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(23, 59, 59, 999);
  for (; d <= endNorm; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === target) return new Date(d);
  }
  return null;
}

type LessonTemplateSeed = {
  id: number;
  name: string;
  day: Day;
  startTime: Date;
  endTime: Date;
  subjectId: number;
  classId: number;
  teacherId: string;
  roomId: number | null;
  deliveryMode: LessonDeliveryMode;
  meetingUrl: string | null;
  meetingLabel: string | null;
};

/**
 * Expands weekly lesson templates into `LessonSession` rows for each term.
 * `Lesson` / `LessonSession` always store `schoolId`; memberships are unrelated.
 * `startTime` / `endTime` must match each occurrence’s calendar day (template clock + session date).
 */
async function seedWeeklyLessonSessions(
  schoolId: string,
  termRows: { id: string; startDate: Date; endDate: Date }[],
  lessonTemplates: LessonTemplateSeed[]
): Promise<number> {
  let created = 0;
  for (const term of termRows) {
    const tStart = new Date(term.startDate);
    const tEnd = new Date(term.endDate);
    for (const lesson of lessonTemplates) {
      const first = firstCalendarDateOnOrAfter(tStart, tEnd, lesson.day);
      if (!first) continue;
      let d: Date = first;
      while (d <= tEnd) {
        const startDt = combineCalendarDayWithTemplateClock(d, lesson.startTime);
        const endDt = combineCalendarDayWithTemplateClock(d, lesson.endTime);
        const sessionDate = new Date(d);
        sessionDate.setHours(12, 0, 0, 0);
        try {
          await prisma.lessonSession.create({
            data: {
              termId: term.id,
              schoolId,
              templateLessonId: lesson.id,
              sessionDate,
              day: lesson.day,
              name: lesson.name,
              startTime: startDt,
              endTime: endDt,
              subjectId: lesson.subjectId,
              classId: lesson.classId,
              teacherId: lesson.teacherId,
              roomId: lesson.roomId,
              deliveryMode: lesson.deliveryMode,
              meetingUrl: lesson.meetingUrl,
              meetingLabel: lesson.meetingLabel,
            },
          });
          created++;
        } catch (e: unknown) {
          if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
            // duplicate (templateLessonId, sessionDate)
          } else {
            throw e;
          }
        }
        const nextWeek: Date = new Date(d);
        nextWeek.setDate(nextWeek.getDate() + 7);
        d = nextWeek;
      }
    }
  }
  return created;
}

async function main() {
  console.log("Start seeding ...\n");

  const hashedPassword = await bcrypt.hash(COMMON_PASSWORD, 10);

  // ─── SYSTEM ADMIN ────────────────────────────
  let sysAdminAuth = await prisma.auth.findUnique({ where: { username: "sysadmin" } });
  if (!sysAdminAuth) {
    sysAdminAuth = await prisma.auth.create({
      data: {
        username: "sysadmin",
        email: "sysadmin@skooly.com",
        password: hashedPassword,
        role: "system_admin",
        accountType: AccountType.SYSTEM_ADMIN,
        schoolId: null,
        systemAdmin: { create: { name: "System Administrator" } },
      },
    });
    console.log("Created system admin: sysadmin");
  }

  // ─── SUBSCRIPTION PLANS ──────────────────────
  const plans = [
    { name: "Free Trial", price: 0, currency: "USD", billingCycle: BillingCycle.MONTHLY, stripePriceId: "price_free_trial", features: ["Full access for 14 days", "Up to 10 students"], isActive: true },
    { name: "Basic Monthly", price: 10, currency: "USD", billingCycle: BillingCycle.MONTHLY, stripePriceId: "price_basic_monthly", features: ["Up to 50 students", "Up to 5 teachers", "Basic support"], isActive: true },
    { name: "Premium Yearly", price: 1000, currency: "USD", billingCycle: BillingCycle.YEARLY, stripePriceId: "price_premium_yearly", features: ["Unlimited students", "Unlimited teachers", "Priority support", "Advanced reporting"], isActive: true },
  ];
  for (const p of plans) {
    await prisma.subscriptionPlan.upsert({ where: { name: p.name }, update: p, create: p });
  }
  console.log("Upserted subscription plans\n");

  // ─── SCHOOL ──────────────────────────────────
  const school = await prisma.school.create({
    data: { name: "Springfield Academy" },
  });
  console.log(`Created school: ${school.name} (${school.id})`);

  // ─── ACADEMIC YEAR (2025–2026) + 3 TERMS ─────
  /** Demo “current” cycle: Sept 2025 – June 2026 */
  const ACADEMIC_YEAR_START = 2025;
  const ACADEMIC_YEAR_END = 2026;

  const academicYear = await prisma.academicYear.create({
    data: {
      name: `${ACADEMIC_YEAR_START}-${ACADEMIC_YEAR_END}`,
      startDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      endDate: new Date(`${ACADEMIC_YEAR_END}-06-30`),
      schoolId: school.id,
      isActive: true,
    },
  });
  await prisma.school.update({ where: { id: school.id }, data: { activeAcademicYearId: academicYear.id } });
  console.log(`Created academic year: ${academicYear.name}`);

  const termDefs = [
    { name: "Fall 2025", startDate: new Date(2025, 8, 1), endDate: new Date(2025, 11, 31) },
    { name: "Winter 2026", startDate: new Date(2026, 0, 1), endDate: new Date(2026, 2, 31) },
    { name: "Spring 2026", startDate: new Date(2026, 3, 1), endDate: new Date(2026, 5, 30) },
  ];
  const now = new Date();
  let activeTermIndex = termDefs.findIndex(
    (t) => now >= t.startDate && now <= t.endDate
  );
  if (activeTermIndex < 0) {
    activeTermIndex = 0;
  }

  const terms: { id: string; name: string; startDate: Date; endDate: Date }[] = [];
  for (let i = 0; i < termDefs.length; i++) {
    const t = termDefs[i];
    const term = await prisma.term.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: i === activeTermIndex,
        isArchived: false,
      },
    });
    terms.push(term);
  }
  console.log(
    `Created ${terms.length} terms (${terms.map((x) => x.name).join(", ")}); active: ${terms[activeTermIndex].name}\n`
  );

  // ─── CALENDAR EXCEPTIONS (holidays / breaks / exam periods) ───────────────
  for (const term of terms) {
    const year = new Date(term.startDate).getFullYear();
    const month = new Date(term.startDate).getMonth();

    await prisma.schoolCalendarException.createMany({
      data: [
        {
          schoolId: school.id,
          termId: term.id,
          title: `${term.name} Midterm Exam Window`,
          type: CalendarExceptionType.EXAM_PERIOD,
          startDate: new Date(year, month, 15, 8, 0, 0),
          endDate: new Date(year, month, 20, 17, 0, 0),
          notes: "Reserved for centralized midterm assessments.",
        },
        {
          schoolId: school.id,
          termId: term.id,
          title: `${term.name} Short Break`,
          type: CalendarExceptionType.BREAK,
          startDate: new Date(year, month, 25, 0, 0, 0),
          endDate: new Date(year, month, 27, 23, 59, 59),
          notes: "Scheduled term break.",
        },
        {
          schoolId: school.id,
          termId: term.id,
          title: `${term.name} Public Holiday`,
          type: CalendarExceptionType.HOLIDAY,
          startDate: new Date(year, month, 8, 0, 0, 0),
          endDate: new Date(year, month, 9, 23, 59, 59),
          notes: "Official school holiday.",
        },
      ],
    });
  }
  console.log(`Created ${terms.length * 3} calendar exceptions`);

  // ─── GRADES (1-6) ───────────────────────────
  const grades = [];
  for (let i = 1; i <= 6; i++) {
    const g = await prisma.grade.create({ data: { level: i.toString(), schoolId: school.id } });
    grades.push(g);
  }
  console.log(`Created ${grades.length} grades`);

  // ─── CLASSES (2 per grade = 12 classes) ──────
  const classes = [];
  for (const grade of grades) {
    for (const section of ["A", "B"]) {
      const cls = await prisma.class.create({
        data: {
          name: `${grade.level}${section}`,
          capacity: randomInt(20, 30),
          gradeId: grade.id,
          schoolId: school.id,
          academicYearId: academicYear.id,
        },
      });
      classes.push(cls);
    }
  }
  console.log(`Created ${classes.length} classes`);

  // ─── SUBJECTS ────────────────────────────────
  const subjectNames = ["Mathematics", "Science", "English", "History", "Geography", "Physics", "Chemistry", "Biology", "Computer Science", "Art", "Physical Education", "Music"];
  const subjects = [];
  for (const name of subjectNames) {
    const s = await prisma.subject.create({ data: { name, schoolId: school.id } });
    subjects.push(s);
  }
  console.log(`Created ${subjects.length} subjects`);

  // ─── ROOMS ───────────────────────────────────
  const roomData = [
    { name: "Room 101", type: "Classroom" },
    { name: "Room 102", type: "Classroom" },
    { name: "Room 103", type: "Classroom" },
    { name: "Room 104", type: "Classroom" },
    { name: "Room 105", type: "Classroom" },
    { name: "Room 106", type: "Classroom" },
    { name: "Science Lab", type: "Lab", capacity: 25 },
    { name: "Computer Lab", type: "Lab", capacity: 30 },
    { name: "Art Studio", type: "Studio", capacity: 20 },
    { name: "Gymnasium", type: "Gym", capacity: 60 },
    { name: "Music Room", type: "Studio", capacity: 25 },
    { name: "Library", type: "Library", capacity: 40 },
  ];
  const rooms = [];
  for (const r of roomData) {
    const room = await prisma.room.create({
      data: { name: r.name, type: r.type, capacity: r.capacity ?? 30, schoolId: school.id },
    });
    rooms.push(room);
  }
  console.log(`Created ${rooms.length} rooms`);

  // ─── CURRICULUM (subjects per grade with coefficients) ─────
  const coefficients: Record<string, number> = {
    Mathematics: 3, Science: 2, English: 3, History: 1, Geography: 1,
    Physics: 2, Chemistry: 2, Biology: 2, "Computer Science": 1.5,
    Art: 1, "Physical Education": 1, Music: 1,
  };
  /** Weekly period targets for timetable / catalog (every grade × subject row) */
  const periodsPerWeekBySubject: Record<string, number> = {
    Mathematics: 4,
    English: 4,
    Science: 3,
    "Computer Science": 2,
    History: 2,
    Geography: 2,
    Physics: 3,
    Chemistry: 3,
    Biology: 3,
    Art: 2,
    "Physical Education": 2,
    Music: 2,
  };
  const curricula = [];
  for (const grade of grades) {
    for (const subject of subjects) {
      const c = await prisma.curriculum.create({
        data: {
          academicYearId: academicYear.id,
          gradeId: grade.id,
          subjectId: subject.id,
          schoolId: school.id,
          coefficient: coefficients[subject.name] ?? 1.0,
          periodsPerWeek: periodsPerWeekBySubject[subject.name] ?? 2,
          description: `${subject.name} curriculum for Grade ${grade.level}`,
        },
      });
      curricula.push(c);
    }
  }
  const sampleCurriculum = curricula[0];
  if (sampleCurriculum) {
    await prisma.curriculum.update({
      where: { id: sampleCurriculum.id },
      data: {
        syllabusOutline: 'Sample: Term 1 — foundations; Term 2 — applications (seed demo).',
        syllabusUrl: 'https://example.com/syllabus',
      },
    });
    await prisma.curriculumBook.create({
      data: {
        curriculumId: sampleCurriculum.id,
        sortOrder: 0,
        title: 'Sample textbook (seed)',
        role: 'primary',
        authors: 'Demo Author',
        publisher: 'Example Press',
      },
    });
  }
  console.log(`Created ${curricula.length} curriculum entries\n`);

  // ─── ADMIN ───────────────────────────────────
  const adminAuth = await prisma.auth.create({
    data: {
      username: "admin1",
      email: "admin@springfield.edu",
      password: hashedPassword,
      role: "admin",
      accountType: AccountType.SCHOOL_ADMIN,
      schoolId: school.id,
    },
  });
  const admin = await prisma.admin.create({
    data: {
      username: "admin1",
      name: "Sarah",
      surname: "Principal",
      authId: adminAuth.id,
      schoolId: school.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: adminAuth.id, schoolId: school.id, role: "admin", adminId: admin.id },
  });
  console.log("Created admin: admin1 (Sarah Principal)");

  // ─── TEACHERS (15) ──────────────────────────
  const teachers = [];
  for (let i = 0; i < 15; i++) {
    const sex = i % 2 === 0 ? UserSex.FEMALE : UserSex.MALE;
    const { first, last } = randomName(sex);
    const username = `teacher${i + 1}`;

    const auth = await prisma.auth.create({
      data: {
        username,
        email: `${username}@springfield.edu`,
        password: hashedPassword,
        role: "teacher",
        accountType: AccountType.TEACHER,
        schoolId: school.id,
      },
    });

    const subjectIdx = i % subjects.length;
    const classIdx = i % classes.length;

    const teacher = await prisma.teacher.create({
      data: {
        username,
        name: first,
        surname: last,
        email: `${username}@springfield.edu`,
        phone: `555-010-${String(i + 1).padStart(4, "0")}`,
        address: `${randomInt(100, 999)} Oak Street`,
        bloodType: randomFrom(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
        sex,
        birthday: new Date(randomInt(1975, 1995), randomInt(0, 11), randomInt(1, 28)),
        schoolId: school.id,
        authId: auth.id,
        subjects: { connect: [{ id: subjects[subjectIdx].id }] },
        classes: { connect: [{ id: classes[classIdx].id }] },
      },
    });

    await prisma.schoolMembership.create({
      data: { authId: auth.id, schoolId: school.id, role: "teacher", teacherId: teacher.id },
    });

    teachers.push(teacher);
  }
  console.log(`Created ${teachers.length} teachers`);

  // ─── BELL SCHEDULE PERIODS (Phase 6) — non-overlapping 08:00–16:00, strict grid readiness ───
  const seededPeriods: { id: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const h = 8 + i;
    const p = await prisma.period.create({
      data: {
        schoolId: school.id,
        name: `Period ${i + 1}`,
        startTime: new Date(ACADEMIC_YEAR_START, 8, 1, h, 0),
        endTime: new Date(ACADEMIC_YEAR_START, 8, 1, h + 1, 0),
        order: i,
        isArchived: false,
      },
    });
    seededPeriods.push(p);
  }
  console.log(`Created ${seededPeriods.length} bell schedule periods`);

  const teacherMultiAuth = await prisma.auth.create({
    data: {
      username: "teacher_multi",
      email: "teacher_multi@demo.local",
      password: hashedPassword,
      role: "teacher",
      accountType: AccountType.TEACHER,
      schoolId: school.id,
    },
  });
  const teacherMulti = await prisma.teacher.create({
    data: {
      username: "teacher_multi",
      name: "Alex",
      surname: "MultiSchool",
      email: "teacher_multi@demo.local",
      phone: "555-040-0001",
      address: "100 Cross St",
      bloodType: "O+",
      sex: UserSex.MALE,
      birthday: new Date(1985, 4, 15),
      schoolId: school.id,
      authId: teacherMultiAuth.id,
      subjects: { connect: [{ id: subjects[0].id }] },
      classes: { connect: [{ id: classes[0].id }] },
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: teacherMultiAuth.id, schoolId: school.id, role: "teacher", teacherId: teacherMulti.id },
  });
  console.log("Created teacher_multi (Springfield membership; Riverside + Westbrook linked later)");

  // ─── LESSONS (all 12 subjects × 12 classes = 144 templates per school) ────
  const days = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY];
  const lessons: { id: number; name: string; classId: number }[] = [];
  for (const cls of classes) {
    const classOffset = classes.findIndex((c) => c.id === cls.id);
    for (let s = 0; s < subjects.length; s++) {
      const slot = s + classOffset * 4;
      const day = days[slot % days.length];
      const periodIdx = Math.floor(slot / 5) % 8;
      const hour = 8 + periodIdx;
      const periodForSlot = seededPeriods[periodIdx]!;
      const teacherId =
        cls.id === classes[0].id && s === 0
          ? teacherMulti.id // Springfield: Monday double block P1–P2; Riverside/Westbrook stagger Alex (see below)
          : teachers[(s + classOffset) % teachers.length].id;
      const room = rooms[(s + classOffset) % rooms.length];
      const isDoubleBlock = cls.id === classes[0].id && s === 0 && seededPeriods[1];
      const endPeriod = isDoubleBlock ? seededPeriods[1] : null;
      const endHour = endPeriod ? hour + 2 : hour + 1;

      const lesson = await prisma.lesson.create({
        data: {
          name: `${subjects[s].name} - ${cls.name}`,
          day,
          startTime: new Date(ACADEMIC_YEAR_START, 8, 1, hour, 0),
          endTime: new Date(ACADEMIC_YEAR_START, 8, 1, endHour, 0),
          periodId: periodForSlot.id,
          endPeriodId: endPeriod?.id ?? null,
          subjectId: subjects[s].id,
          classId: cls.id,
          teacherId,
          schoolId: school.id,
          roomId: room.id,
        },
      });
      lessons.push(lesson);
    }
  }

  // One online (live) demo template per school — Saturday avoids collisions with Mon–Fri grid; no physical room.
  await prisma.lesson.create({
    data: {
      name: `${subjects[0].name} — Online live (seed demo)`,
      day: Day.SATURDAY,
      startTime: new Date(ACADEMIC_YEAR_START, 8, 1, 9, 0),
      endTime: new Date(ACADEMIC_YEAR_START, 8, 1, 10, 0),
      periodId: seededPeriods[1]!.id,
      endPeriodId: null,
      subjectId: subjects[0].id,
      classId: classes[0].id,
      teacherId: teachers[0].id,
      schoolId: school.id,
      roomId: null,
      deliveryMode: LessonDeliveryMode.ONLINE,
      meetingUrl: "https://example.com/meet/springfield-demo",
      meetingLabel: "Join (demo)",
    },
  });

  console.log(
    `Created ${lessons.length} Springfield lesson templates (all subjects × all classes) + 1 online demo`
  );

  const springfieldLessonTemplates = await prisma.lesson.findMany({
    where: { schoolId: school.id },
    select: {
      id: true,
      name: true,
      day: true,
      startTime: true,
      endTime: true,
      subjectId: true,
      classId: true,
      teacherId: true,
      roomId: true,
      deliveryMode: true,
      meetingUrl: true,
      meetingLabel: true,
    },
  });
  const springfieldSessionCount = await seedWeeklyLessonSessions(school.id, terms, springfieldLessonTemplates);
  console.log(`Created ${springfieldSessionCount} lesson sessions for Springfield (weekly per term)\n`);

  // ─── PARENTS (30) ───────────────────────────
  const parents = [];
  for (let i = 0; i < 30; i++) {
    const sex = i % 2 === 0 ? UserSex.FEMALE : UserSex.MALE;
    const { first, last } = randomName(sex);
    const username = `parent${i + 1}`;

    const auth = await prisma.auth.create({
      data: {
        username,
        email: `${username}@email.com`,
        password: hashedPassword,
        role: "parent",
        accountType: AccountType.PARENT,
        schoolId: school.id,
      },
    });

    const parent = await prisma.parent.create({
      data: {
        username,
        name: first,
        surname: last,
        email: `${username}@email.com`,
        phone: `555-020-${String(i + 1).padStart(4, "0")}`,
        address: `${randomInt(100, 999)} Maple Drive`,
        schoolId: school.id,
        authId: auth.id,
      },
    });

    await prisma.schoolMembership.create({
      data: { authId: auth.id, schoolId: school.id, role: "parent", parentId: parent.id },
    });

    parents.push(parent);
  }
  console.log(`Created ${parents.length} parents`);

  // ─── STUDENTS (60, ~5 per class, 2 kids per parent) ─────
  const students = [];
  for (let i = 0; i < 60; i++) {
    const sex = i % 2 === 0 ? UserSex.MALE : UserSex.FEMALE;
    const { first, last } = randomName(sex);
    const username = `student${i + 1}`;
    const cls = classes[i % classes.length];
    const grade = grades.find(g => g.id === cls.gradeId)!;
    const parent = parents[Math.floor(i / 2) % parents.length];

    const auth = await prisma.auth.create({
      data: {
        username,
        email: `${username}@springfield.edu`,
        password: hashedPassword,
        role: "student",
        accountType: AccountType.STUDENT,
        schoolId: school.id,
      },
    });

    const student = await prisma.student.create({
      data: {
        username,
        name: first,
        surname: last,
        email: `${username}@springfield.edu`,
        phone: `555-030-${String(i + 1).padStart(4, "0")}`,
        address: `${randomInt(100, 999)} Elm Avenue`,
        bloodType: randomFrom(["A+", "A-", "B+", "O+", "O-"]),
        sex,
        birthday: new Date(randomInt(2010, 2016), randomInt(0, 11), randomInt(1, 28)),
        parentId: parent.id,
        gradeId: grade.id,
        classId: cls.id,
        schoolId: school.id,
        authId: auth.id,
      },
    });

    await prisma.schoolMembership.create({
      data: { authId: auth.id, schoolId: school.id, role: "student", studentId: student.id },
    });

    await prisma.studentEnrollmentHistory.create({
      data: {
        studentId: student.id,
        classId: cls.id,
        academicYearId: academicYear.id,
        enrollmentDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
        status: EnrollmentStatus.ENROLLED,
      },
    });

    students.push(student);
  }
  console.log(`Created ${students.length} students with enrollment history\n`);

  // ─── EXAMS (2 per subject-lesson combo, with varying maxScore/weight) ─────
  const exams = [];
  const lessonsForExams = lessons.slice(0, 24);
  for (let i = 0; i < lessonsForExams.length; i++) {
    const lesson = lessonsForExams[i];
    const maxScore = randomFrom([20, 50, 100]);
    const exam = await prisma.exam.create({
      data: {
        title: `${i < 12 ? "Midterm" : "Final"} - ${lesson.name}`,
        startTime: new Date(i < 12 ? ACADEMIC_YEAR_START : ACADEMIC_YEAR_END, i < 12 ? 10 : 2, randomInt(1, 15), 9, 0),
        endTime: new Date(i < 12 ? ACADEMIC_YEAR_START : ACADEMIC_YEAR_END, i < 12 ? 10 : 2, randomInt(1, 15), 11, 0),
        maxScore,
        weight: i < 12 ? 1.0 : 2.0,
        lessonId: lesson.id,
        schoolId: school.id,
        examCategory: i % 8 === 0 ? ExamCategory.POP_QUIZ : ExamCategory.COURSE_EXAM,
        durationMinutes: i % 8 === 0 ? 15 : 60,
      },
    });
    exams.push(exam);
  }
  console.log(`Created ${exams.length} exams`);

  // ─── ASSIGNMENTS (1 per first 20 lessons) ────
  const assignments = [];
  for (let i = 0; i < Math.min(20, lessons.length); i++) {
    const lesson = lessons[i];
    const maxScore = randomFrom([10, 20, 50]);
    const a = await prisma.assignment.create({
      data: {
        title: `Homework ${i + 1} - ${lesson.name}`,
        startDate: new Date(ACADEMIC_YEAR_START, 9, randomInt(1, 28)),
        dueDate: new Date(ACADEMIC_YEAR_START, 9, randomInt(1, 28) + 7),
        maxScore,
        weight: 0.5,
        lessonId: lesson.id,
        dueLessonId: lesson.id,
        schoolId: school.id,
      },
    });
    assignments.push(a);
  }
  console.log(`Created ${assignments.length} assignments`);

  // ─── RESULTS (exam and assignment scores for students) ─────
  let resultCount = 0;
  for (const exam of exams) {
    const classStudents = students.filter(s => {
      const lessonClass = lessons.find(l => l.id === exam.lessonId);
      return lessonClass && s.classId === lessonClass.classId;
    });
    for (const student of classStudents.slice(0, 5)) {
      await prisma.result.create({
        data: {
          score: randomScore(exam.maxScore),
          studentId: student.id,
          examId: exam.id,
          schoolId: school.id,
        },
      });
      resultCount++;
    }
  }
  for (const assignment of assignments) {
    const classStudents = students.filter(s => {
      const lessonClass = lessons.find(l => l.id === assignment.lessonId);
      return lessonClass && s.classId === lessonClass.classId;
    });
    for (const student of classStudents.slice(0, 5)) {
      await prisma.result.create({
        data: {
          score: randomScore(assignment.maxScore),
          studentId: student.id,
          assignmentId: assignment.id,
          schoolId: school.id,
        },
      });
      resultCount++;
    }
  }
  console.log(`Created ${resultCount} results`);

  await backfillAssignmentDueLessonLinks();

  // ─── ATTENDANCE (last 30 school days for all students) ──────
  let attendanceCount = 0;
  for (const student of students) {
    const studentLessons = lessons.filter(l => l.classId === student.classId).slice(0, 4);
    for (let d = 0; d < 15; d++) {
      const date = new Date(ACADEMIC_YEAR_START, 9, d + 1);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      for (const lesson of studentLessons) {
        const roll = Math.random();
        const status: AttendanceStatus = roll < 0.85 ? AttendanceStatus.PRESENT : roll < 0.95 ? AttendanceStatus.LATE : AttendanceStatus.ABSENT;
        await prisma.attendance.create({
          data: {
            date,
            status,
            studentId: student.id,
            lessonId: lesson.id,
            schoolId: school.id,
            academicYearId: academicYear.id,
          },
        });
        attendanceCount++;
      }
    }
  }
  console.log(`Created ${attendanceCount} attendance records\n`);

  // ─── EVENTS ──────────────────────────────────
  const eventData = [
    { title: "Parent-Teacher Conference", description: "Annual meeting to discuss student progress", daysAhead: 14 },
    { title: "Science Fair", description: "Students present their science projects", daysAhead: 30 },
    { title: "Sports Day", description: "Inter-class sports competition", daysAhead: 45 },
    { title: "End of Year Ceremony", description: "Graduation and award ceremony", daysAhead: 90 },
    { title: "School Open Day", description: "Open day for prospective parents", daysAhead: 7 },
  ];
  for (let i = 0; i < eventData.length; i++) {
    const e = eventData[i];
    await prisma.event.create({
      data: {
        title: e.title,
        description: e.description,
        startTime: new Date(Date.now() + e.daysAhead * 86400000),
        endTime: new Date(Date.now() + e.daysAhead * 86400000 + 3 * 3600000),
        classId: i < classes.length ? classes[i].id : null,
        schoolId: school.id,
      },
    });
  }
  console.log(`Created ${eventData.length} events`);

  // ─── ANNOUNCEMENTS ───────────────────────────
  const announcements = [
    { title: "Welcome Back!", content: "Welcome to the new academic year. We are excited to have everyone back." },
    { title: "Library Hours Extended", content: "The library will now be open until 6 PM on weekdays." },
    { title: "Uniform Reminder", content: "Please ensure students wear proper school uniform every day." },
    { title: "Midterm Exams Schedule", content: "Midterm exams will begin on November 15th. Study hard!" },
    { title: "Holiday Break", content: "School will be closed from December 20th to January 3rd for winter break." },
    { title: "New Computer Lab", content: "The new computer lab is now open. Students can book slots through their teachers." },
  ];
  for (let i = 0; i < announcements.length; i++) {
    await prisma.announcement.create({
      data: {
        ...announcements[i],
        classId: i < 3 ? classes[i].id : null,
        schoolId: school.id,
      },
    });
  }
  console.log(`Created ${announcements.length} announcements`);

  // ─── GRADING SCALES ──────────────────────────
  const frenchScale = await prisma.gradingScale.create({
    data: {
      schoolId: school.id, name: "French System (/20)", maxScore: 20, isDefault: true,
      bands: {
        create: [
          { label: "Excellent", abbreviation: "E", minPercentage: 80, maxPercentage: 100, color: "#22c55e", isPassing: true, order: 1 },
          { label: "Very Good", abbreviation: "TB", minPercentage: 70, maxPercentage: 79.99, color: "#84cc16", isPassing: true, order: 2 },
          { label: "Good", abbreviation: "B", minPercentage: 60, maxPercentage: 69.99, color: "#eab308", isPassing: true, order: 3 },
          { label: "Satisfactory", abbreviation: "AB", minPercentage: 50, maxPercentage: 59.99, color: "#f97316", isPassing: true, order: 4 },
          { label: "Insufficient", abbreviation: "I", minPercentage: 25, maxPercentage: 49.99, color: "#ef4444", isPassing: false, order: 5 },
          { label: "Very Insufficient", abbreviation: "TI", minPercentage: 0, maxPercentage: 24.99, color: "#dc2626", isPassing: false, order: 6 },
        ],
      },
    },
  });
  console.log(`Created grading scale: ${frenchScale.name}`);

  await prisma.gradingScale.create({
    data: {
      schoolId: school.id, name: "US Letter Grade", maxScore: 100, isDefault: false,
      bands: {
        create: [
          { label: "A+", abbreviation: "A+", minPercentage: 97, maxPercentage: 100, color: "#22c55e", isPassing: true, order: 1 },
          { label: "A", abbreviation: "A", minPercentage: 93, maxPercentage: 96.99, color: "#22c55e", isPassing: true, order: 2 },
          { label: "A-", abbreviation: "A-", minPercentage: 90, maxPercentage: 92.99, color: "#4ade80", isPassing: true, order: 3 },
          { label: "B+", abbreviation: "B+", minPercentage: 87, maxPercentage: 89.99, color: "#84cc16", isPassing: true, order: 4 },
          { label: "B", abbreviation: "B", minPercentage: 83, maxPercentage: 86.99, color: "#84cc16", isPassing: true, order: 5 },
          { label: "B-", abbreviation: "B-", minPercentage: 80, maxPercentage: 82.99, color: "#a3e635", isPassing: true, order: 6 },
          { label: "C+", abbreviation: "C+", minPercentage: 77, maxPercentage: 79.99, color: "#eab308", isPassing: true, order: 7 },
          { label: "C", abbreviation: "C", minPercentage: 73, maxPercentage: 76.99, color: "#eab308", isPassing: true, order: 8 },
          { label: "C-", abbreviation: "C-", minPercentage: 70, maxPercentage: 72.99, color: "#f59e0b", isPassing: true, order: 9 },
          { label: "D", abbreviation: "D", minPercentage: 60, maxPercentage: 69.99, color: "#f97316", isPassing: true, order: 10 },
          { label: "F", abbreviation: "F", minPercentage: 0, maxPercentage: 59.99, color: "#ef4444", isPassing: false, order: 11 },
        ],
      },
    },
  });
  console.log("Created grading scale: US Letter Grade");

  // ─── PROMOTION RULES ────────────────────────
  for (const grade of grades) {
    await prisma.promotionRules.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        gradeId: grade.id,
        passingThreshold: 50,
        minimumOverallAverage: 50,
        maxFailedSubjects: 2,
        minimumAttendance: 75,
        borderlineMargin: 5,
      },
    });
  }
  console.log(`Created promotion rules for ${grades.length} grades`);

  // ─── JOIN CODES (samples) ────────────────────
  const joinCodes = [
    { code: "JOIN-1A-2025", type: JoinCodeType.CLASS_STUDENT, classId: classes[0].id, maxUses: 30 },
    { code: "JOIN-1B-2025", type: JoinCodeType.CLASS_STUDENT, classId: classes[1].id, maxUses: 30 },
    { code: "TEACHER-INVITE-01", type: JoinCodeType.TEACHER_INVITE, classId: null, maxUses: 5 },
  ];
  for (const jc of joinCodes) {
    await prisma.joinCode.create({
      data: {
        code: jc.code,
        schoolId: school.id,
        type: jc.type,
        classId: jc.classId,
        maxUses: jc.maxUses,
        createdBy: adminAuth.id,
        expiresAt: new Date(Date.now() + 90 * 86400000),
      },
    });
  }
  console.log(`Created ${joinCodes.length} join codes\n`);

  // ─── MULTI-SCHOOL DEMO (Riverside High + shared logins) ─────
  const schoolB = await prisma.school.create({
    data: { name: "Riverside High" },
  });
  console.log(`Created school B: ${schoolB.name} (${schoolB.id})`);

  const academicYearB = await prisma.academicYear.create({
    data: {
      name: `${ACADEMIC_YEAR_START}-${ACADEMIC_YEAR_END}`,
      startDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      endDate: new Date(`${ACADEMIC_YEAR_END}-06-30`),
      schoolId: schoolB.id,
      isActive: true,
    },
  });
  await prisma.school.update({
    where: { id: schoolB.id },
    data: { activeAcademicYearId: academicYearB.id },
  });

  const termsB: { id: string; name: string; startDate: Date; endDate: Date }[] = [];
  for (let i = 0; i < termDefs.length; i++) {
    const t = termDefs[i];
    const term = await prisma.term.create({
      data: {
        schoolId: schoolB.id,
        academicYearId: academicYearB.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: i === activeTermIndex,
        isArchived: false,
      },
    });
    termsB.push(term);
  }

  for (const term of termsB) {
    const year = new Date(term.startDate).getFullYear();
    const month = new Date(term.startDate).getMonth();
    await prisma.schoolCalendarException.createMany({
      data: [
        {
          schoolId: schoolB.id,
          termId: term.id,
          title: `${term.name} Midterm Exam Window`,
          type: CalendarExceptionType.EXAM_PERIOD,
          startDate: new Date(year, month, 15, 8, 0, 0),
          endDate: new Date(year, month, 20, 17, 0, 0),
          notes: "Reserved for centralized midterm assessments.",
        },
      ],
    });
  }

  const gradesB = [];
  for (let i = 1; i <= 6; i++) {
    gradesB.push(await prisma.grade.create({ data: { level: i.toString(), schoolId: schoolB.id } }));
  }

  const classesB = [];
  for (const grade of gradesB) {
    for (const section of ["A", "B"]) {
      classesB.push(
        await prisma.class.create({
          data: {
            name: `${grade.level}${section}`,
            capacity: randomInt(20, 30),
            gradeId: grade.id,
            schoolId: schoolB.id,
            academicYearId: academicYearB.id,
          },
        })
      );
    }
  }

  const subjectsB = [];
  for (const name of subjectNames) {
    subjectsB.push(await prisma.subject.create({ data: { name, schoolId: schoolB.id } }));
  }

  const roomsB = [];
  for (let i = 0; i < 8; i++) {
    roomsB.push(
      await prisma.room.create({
        data: {
          name: `Riverside ${201 + i}`,
          type: "Classroom",
          capacity: 30,
          schoolId: schoolB.id,
        },
      })
    );
  }

  for (const grade of gradesB) {
    for (const subject of subjectsB) {
      await prisma.curriculum.create({
        data: {
          academicYearId: academicYearB.id,
          gradeId: grade.id,
          subjectId: subject.id,
          schoolId: schoolB.id,
          coefficient: coefficients[subject.name] ?? 1.0,
          periodsPerWeek: periodsPerWeekBySubject[subject.name] ?? 2,
          description: `${subject.name} curriculum for Grade ${grade.level}`,
        },
      });
    }
  }

  const periodsB: { id: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const h = 8 + i;
    const p = await prisma.period.create({
      data: {
        schoolId: schoolB.id,
        name: `Period ${i + 1}`,
        startTime: new Date(ACADEMIC_YEAR_START, 8, 1, h, 0),
        endTime: new Date(ACADEMIC_YEAR_START, 8, 1, h + 1, 0),
        order: i,
        isArchived: false,
      },
    });
    periodsB.push(p);
  }

  // Riverside-only teachers + full timetable (mirrors Springfield scale)
  const teachersRiverside: { id: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const sex = i % 2 === 0 ? UserSex.FEMALE : UserSex.MALE;
    const { first, last } = randomName(sex);
    const username = `rv_teacher${i + 1}`;
    const authRv = await prisma.auth.create({
      data: {
        username,
        email: `${username}@riverside.edu`,
        password: hashedPassword,
        role: "teacher",
        accountType: AccountType.TEACHER,
        schoolId: schoolB.id,
      },
    });
    const tr = await prisma.teacher.create({
      data: {
        username,
        name: first,
        surname: last,
        email: `${username}@riverside.edu`,
        phone: `555-041-${String(i + 1).padStart(4, "0")}`,
        address: `${randomInt(100, 999)} River Rd`,
        bloodType: randomFrom(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
        sex,
        birthday: new Date(randomInt(1975, 1995), randomInt(0, 11), randomInt(1, 28)),
        schoolId: schoolB.id,
        authId: authRv.id,
        subjects: { connect: [{ id: subjectsB[i % subjectsB.length]!.id }] },
        classes: { connect: [{ id: classesB[i % classesB.length]!.id }] },
      },
    });
    await prisma.schoolMembership.create({
      data: { authId: authRv.id, schoolId: schoolB.id, role: "teacher", teacherId: tr.id },
    });
    teachersRiverside.push(tr);
  }
  console.log(`Created ${teachersRiverside.length} Riverside-only teachers`);

  await prisma.teacher.update({
    where: { id: teacherMulti.id },
    data: {
      subjects: { connect: [{ id: subjectsB[0]!.id }] },
      classes: { connect: [{ id: classesB[0]!.id }] },
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: teacherMultiAuth.id, schoolId: schoolB.id, role: "teacher", teacherId: teacherMulti.id },
  });
  console.log("Linked teacher_multi to Riverside");

  const lessonsRiverside: { id: number; name: string; classId: number }[] = [];
  for (const cls of classesB) {
    const classOffset = classesB.findIndex((c) => c.id === cls.id);
    for (let s = 0; s < subjectsB.length; s++) {
      const room = roomsB[(s + classOffset) % roomsB.length]!;
      let day: Day;
      let periodIdx: number;
      let hour: number;
      let periodForSlot: (typeof periodsB)[0];
      let teacherId: string;
      let endPeriod: (typeof periodsB)[0] | null;
      let endHour: number;

      if (cls.id === classesB[0]!.id && s === 0) {
        // Alex MultiSchool: stagger from Springfield (Mon) — Tuesday double block P3–P4
        day = Day.TUESDAY;
        periodIdx = 2;
        hour = 8 + periodIdx;
        periodForSlot = periodsB[periodIdx]!;
        teacherId = teacherMulti.id;
        endPeriod = periodsB[3]!;
        endHour = hour + 2;
      } else {
        const slot = s + classOffset * 4;
        day = days[slot % days.length];
        periodIdx = Math.floor(slot / 5) % 8;
        hour = 8 + periodIdx;
        periodForSlot = periodsB[periodIdx]!;
        teacherId = teachersRiverside[(s + classOffset) % teachersRiverside.length]!.id;
        endPeriod = null;
        endHour = hour + 1;
      }

      const lessonRv = await prisma.lesson.create({
        data: {
          name: `${subjectsB[s]!.name} - ${cls.name}`,
          day,
          startTime: new Date(ACADEMIC_YEAR_START, 8, 1, hour, 0),
          endTime: new Date(ACADEMIC_YEAR_START, 8, 1, endHour, 0),
          periodId: periodForSlot.id,
          endPeriodId: endPeriod?.id ?? null,
          subjectId: subjectsB[s]!.id,
          classId: cls.id,
          teacherId,
          schoolId: schoolB.id,
          roomId: room.id,
        },
      });
      lessonsRiverside.push(lessonRv);
    }
  }

  await prisma.lesson.create({
    data: {
      name: `${subjectsB[0]!.name} — Online live (seed demo)`,
      day: Day.SATURDAY,
      startTime: new Date(ACADEMIC_YEAR_START, 8, 1, 9, 0),
      endTime: new Date(ACADEMIC_YEAR_START, 8, 1, 10, 0),
      periodId: periodsB[1]!.id,
      endPeriodId: null,
      subjectId: subjectsB[0]!.id,
      classId: classesB[0]!.id,
      teacherId: teachersRiverside[0]!.id,
      schoolId: schoolB.id,
      roomId: null,
      deliveryMode: LessonDeliveryMode.ONLINE,
      meetingUrl: "https://example.com/meet/riverside-demo",
      meetingLabel: "Join (demo)",
    },
  });

  console.log(
    `Created ${lessonsRiverside.length} Riverside lesson templates (all subjects × all classes) + 1 online demo`
  );

  const riversideLessonTemplates = await prisma.lesson.findMany({
    where: { schoolId: schoolB.id },
    select: {
      id: true,
      name: true,
      day: true,
      startTime: true,
      endTime: true,
      subjectId: true,
      classId: true,
      teacherId: true,
      roomId: true,
      deliveryMode: true,
      meetingUrl: true,
      meetingLabel: true,
    },
  });
  const multiSessionsB = await seedWeeklyLessonSessions(schoolB.id, termsB, riversideLessonTemplates);
  console.log(`Created ${multiSessionsB} lesson sessions for all Riverside lesson templates\n`);

  const adminMultiAuth = await prisma.auth.create({
    data: {
      username: "admin_multi",
      email: "admin_multi@demo.local",
      password: hashedPassword,
      role: "admin",
      accountType: AccountType.SCHOOL_ADMIN,
      schoolId: school.id,
    },
  });
  const adminMulti = await prisma.admin.create({
    data: {
      username: "admin_multi",
      name: "Jordan",
      surname: "MultiAdmin",
      authId: adminMultiAuth.id,
      schoolId: school.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: adminMultiAuth.id, schoolId: school.id, role: "admin", adminId: adminMulti.id },
  });
  await prisma.schoolMembership.create({
    data: { authId: adminMultiAuth.id, schoolId: schoolB.id, role: "admin", adminId: adminMulti.id },
  });
  console.log("Created admin_multi (primary Springfield, membership Riverside)");

  const parentMultiAuth = await prisma.auth.create({
    data: {
      username: "parent_multi",
      email: "parent_multi@demo.local",
      password: hashedPassword,
      role: "parent",
      accountType: AccountType.PARENT,
      schoolId: school.id,
    },
  });
  const parentMulti = await prisma.parent.create({
    data: {
      username: "parent_multi",
      name: "Taylor",
      surname: "MultiParent",
      email: "parent_multi@demo.local",
      phone: "555-050-0001",
      address: "200 Family Ln",
      schoolId: school.id,
      authId: parentMultiAuth.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: parentMultiAuth.id, schoolId: school.id, role: "parent", parentId: parentMulti.id },
  });
  await prisma.schoolMembership.create({
    data: { authId: parentMultiAuth.id, schoolId: schoolB.id, role: "parent", parentId: parentMulti.id },
  });

  const childAAuth = await prisma.auth.create({
    data: {
      username: "student_multi_a",
      email: "student_multi_a@demo.local",
      password: hashedPassword,
      role: "student",
      accountType: AccountType.STUDENT,
      schoolId: school.id,
    },
  });
  const studentMultiA = await prisma.student.create({
    data: {
      username: "student_multi_a",
      name: "Riley",
      surname: "Springfield",
      email: "student_multi_a@demo.local",
      phone: "555-060-0001",
      address: "200 Family Ln",
      bloodType: "A+",
      sex: UserSex.FEMALE,
      birthday: new Date(2014, 5, 1),
      parentId: parentMulti.id,
      gradeId: grades[0].id,
      classId: classes[0].id,
      schoolId: school.id,
      authId: childAAuth.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: childAAuth.id, schoolId: school.id, role: "student", studentId: studentMultiA.id },
  });
  await prisma.studentEnrollmentHistory.create({
    data: {
      studentId: studentMultiA.id,
      classId: classes[0].id,
      academicYearId: academicYear.id,
      enrollmentDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      status: EnrollmentStatus.ENROLLED,
    },
  });

  const childBAuth = await prisma.auth.create({
    data: {
      username: "student_multi_b",
      email: "student_multi_b@demo.local",
      password: hashedPassword,
      role: "student",
      accountType: AccountType.STUDENT,
      schoolId: schoolB.id,
    },
  });
  const studentMultiB = await prisma.student.create({
    data: {
      username: "student_multi_b",
      name: "Casey",
      surname: "Riverside",
      email: "student_multi_b@demo.local",
      phone: "555-060-0002",
      address: "200 Family Ln",
      bloodType: "B+",
      sex: UserSex.MALE,
      birthday: new Date(2013, 8, 12),
      parentId: parentMulti.id,
      gradeId: gradesB[0]!.id,
      classId: classesB[0]!.id,
      schoolId: schoolB.id,
      authId: childBAuth.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: childBAuth.id, schoolId: schoolB.id, role: "student", studentId: studentMultiB.id },
  });
  await prisma.studentEnrollmentHistory.create({
    data: {
      studentId: studentMultiB.id,
      classId: classesB[0]!.id,
      academicYearId: academicYearB.id,
      enrollmentDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      status: EnrollmentStatus.ENROLLED,
    },
  });
  console.log("Created parent_multi with student_multi_a (Springfield) and student_multi_b (Riverside)");

  // ─── SCHOOL C (Westbrook Academy) — third hub for multi-school accounts ─────
  const schoolC = await prisma.school.create({
    data: { name: "Westbrook Academy" },
  });
  console.log(`Created school C: ${schoolC.name} (${schoolC.id})`);

  const academicYearC = await prisma.academicYear.create({
    data: {
      name: `${ACADEMIC_YEAR_START}-${ACADEMIC_YEAR_END}`,
      startDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      endDate: new Date(`${ACADEMIC_YEAR_END}-06-30`),
      schoolId: schoolC.id,
      isActive: true,
    },
  });
  await prisma.school.update({
    where: { id: schoolC.id },
    data: { activeAcademicYearId: academicYearC.id },
  });

  const termsC: { id: string; name: string; startDate: Date; endDate: Date }[] = [];
  for (let i = 0; i < termDefs.length; i++) {
    const t = termDefs[i];
    const term = await prisma.term.create({
      data: {
        schoolId: schoolC.id,
        academicYearId: academicYearC.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        isActive: i === activeTermIndex,
        isArchived: false,
      },
    });
    termsC.push(term);
  }

  for (const term of termsC) {
    const year = new Date(term.startDate).getFullYear();
    const month = new Date(term.startDate).getMonth();
    await prisma.schoolCalendarException.createMany({
      data: [
        {
          schoolId: schoolC.id,
          termId: term.id,
          title: `${term.name} Midterm Exam Window`,
          type: CalendarExceptionType.EXAM_PERIOD,
          startDate: new Date(year, month, 15, 8, 0, 0),
          endDate: new Date(year, month, 20, 17, 0, 0),
          notes: "Reserved for centralized midterm assessments.",
        },
      ],
    });
  }

  const gradesC = [];
  for (let i = 1; i <= 6; i++) {
    gradesC.push(await prisma.grade.create({ data: { level: i.toString(), schoolId: schoolC.id } }));
  }

  const classesC = [];
  for (const grade of gradesC) {
    for (const section of ["A", "B"]) {
      classesC.push(
        await prisma.class.create({
          data: {
            name: `${grade.level}${section}`,
            capacity: randomInt(20, 30),
            gradeId: grade.id,
            schoolId: schoolC.id,
            academicYearId: academicYearC.id,
          },
        })
      );
    }
  }

  const subjectsC = [];
  for (const name of subjectNames) {
    subjectsC.push(await prisma.subject.create({ data: { name, schoolId: schoolC.id } }));
  }

  const roomsC = [];
  for (let i = 0; i < 8; i++) {
    roomsC.push(
      await prisma.room.create({
        data: {
          name: `Westbrook ${301 + i}`,
          type: "Classroom",
          capacity: 30,
          schoolId: schoolC.id,
        },
      })
    );
  }

  for (const grade of gradesC) {
    for (const subject of subjectsC) {
      await prisma.curriculum.create({
        data: {
          academicYearId: academicYearC.id,
          gradeId: grade.id,
          subjectId: subject.id,
          schoolId: schoolC.id,
          coefficient: coefficients[subject.name] ?? 1.0,
          periodsPerWeek: periodsPerWeekBySubject[subject.name] ?? 2,
          description: `${subject.name} curriculum for Grade ${grade.level}`,
        },
      });
    }
  }

  const periodsC: { id: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const h = 8 + i;
    const p = await prisma.period.create({
      data: {
        schoolId: schoolC.id,
        name: `Period ${i + 1}`,
        startTime: new Date(ACADEMIC_YEAR_START, 8, 1, h, 0),
        endTime: new Date(ACADEMIC_YEAR_START, 8, 1, h + 1, 0),
        order: i,
        isArchived: false,
      },
    });
    periodsC.push(p);
  }

  const teachersWestbrook: { id: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const sex = i % 2 === 0 ? UserSex.FEMALE : UserSex.MALE;
    const { first, last } = randomName(sex);
    const username = `wb_teacher${i + 1}`;
    const authWb = await prisma.auth.create({
      data: {
        username,
        email: `${username}@westbrook.edu`,
        password: hashedPassword,
        role: "teacher",
        accountType: AccountType.TEACHER,
        schoolId: schoolC.id,
      },
    });
    const tw = await prisma.teacher.create({
      data: {
        username,
        name: first,
        surname: last,
        email: `${username}@westbrook.edu`,
        phone: `555-042-${String(i + 1).padStart(4, "0")}`,
        address: `${randomInt(100, 999)} Brook Ln`,
        bloodType: randomFrom(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
        sex,
        birthday: new Date(randomInt(1975, 1995), randomInt(0, 11), randomInt(1, 28)),
        schoolId: schoolC.id,
        authId: authWb.id,
        subjects: { connect: [{ id: subjectsC[i % subjectsC.length]!.id }] },
        classes: { connect: [{ id: classesC[i % classesC.length]!.id }] },
      },
    });
    await prisma.schoolMembership.create({
      data: { authId: authWb.id, schoolId: schoolC.id, role: "teacher", teacherId: tw.id },
    });
    teachersWestbrook.push(tw);
  }
  console.log(`Created ${teachersWestbrook.length} Westbrook-only teachers`);

  await prisma.teacher.update({
    where: { id: teacherMulti.id },
    data: {
      subjects: { connect: [{ id: subjectsC[0]!.id }, { id: subjectsC[3]!.id }] },
      classes: { connect: [{ id: classesC[0]!.id }] },
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: teacherMultiAuth.id, schoolId: schoolC.id, role: "teacher", teacherId: teacherMulti.id },
  });
  await prisma.schoolMembership.create({
    data: { authId: adminMultiAuth.id, schoolId: schoolC.id, role: "admin", adminId: adminMulti.id },
  });
  await prisma.schoolMembership.create({
    data: { authId: parentMultiAuth.id, schoolId: schoolC.id, role: "parent", parentId: parentMulti.id },
  });
  console.log("Linked teacher_multi, admin_multi, parent_multi to Westbrook Academy");

  const lessonsWestbrook: { id: number; name: string; classId: number }[] = [];
  for (const cls of classesC) {
    const classOffset = classesC.findIndex((c) => c.id === cls.id);
    for (let s = 0; s < subjectsC.length; s++) {
      const room = roomsC[(s + classOffset) % roomsC.length]!;
      let day: Day;
      let periodIdx: number;
      let hour: number;
      let periodForSlot: (typeof periodsC)[0];
      let teacherId: string;
      let endPeriod: (typeof periodsC)[0] | null;
      let endHour: number;

      if (cls.id === classesC[0]!.id && s === 0) {
        // Alex MultiSchool: stagger — Wednesday double block P5–P6 (vs Mon Springfield, Tue Riverside)
        day = Day.WEDNESDAY;
        periodIdx = 4;
        hour = 8 + periodIdx;
        periodForSlot = periodsC[periodIdx]!;
        teacherId = teacherMulti.id;
        endPeriod = periodsC[5]!;
        endHour = hour + 2;
      } else {
        const slot = s + classOffset * 4;
        day = days[slot % days.length];
        periodIdx = Math.floor(slot / 5) % 8;
        hour = 8 + periodIdx;
        periodForSlot = periodsC[periodIdx]!;
        teacherId = teachersWestbrook[(s + classOffset) % teachersWestbrook.length]!.id;
        endPeriod = null;
        endHour = hour + 1;
      }

      const lessonWb = await prisma.lesson.create({
        data: {
          name: `${subjectsC[s]!.name} - ${cls.name}`,
          day,
          startTime: new Date(ACADEMIC_YEAR_START, 8, 1, hour, 0),
          endTime: new Date(ACADEMIC_YEAR_START, 8, 1, endHour, 0),
          periodId: periodForSlot.id,
          endPeriodId: endPeriod?.id ?? null,
          subjectId: subjectsC[s]!.id,
          classId: cls.id,
          teacherId,
          schoolId: schoolC.id,
          roomId: room.id,
        },
      });
      lessonsWestbrook.push(lessonWb);
    }
  }

  await prisma.lesson.create({
    data: {
      name: `${subjectsC[0]!.name} — Online live (seed demo)`,
      day: Day.SATURDAY,
      startTime: new Date(ACADEMIC_YEAR_START, 8, 1, 9, 0),
      endTime: new Date(ACADEMIC_YEAR_START, 8, 1, 10, 0),
      periodId: periodsC[1]!.id,
      endPeriodId: null,
      subjectId: subjectsC[0]!.id,
      classId: classesC[0]!.id,
      teacherId: teachersWestbrook[0]!.id,
      schoolId: schoolC.id,
      roomId: null,
      deliveryMode: LessonDeliveryMode.ONLINE,
      meetingUrl: "https://example.com/meet/westbrook-demo",
      meetingLabel: "Join (demo)",
    },
  });

  console.log(
    `Created ${lessonsWestbrook.length} Westbrook lesson templates (all subjects × all classes) + 1 online demo`
  );

  const westbrookLessonTemplates = await prisma.lesson.findMany({
    where: { schoolId: schoolC.id },
    select: {
      id: true,
      name: true,
      day: true,
      startTime: true,
      endTime: true,
      subjectId: true,
      classId: true,
      teacherId: true,
      roomId: true,
      deliveryMode: true,
      meetingUrl: true,
      meetingLabel: true,
    },
  });
  const multiSessionsC = await seedWeeklyLessonSessions(schoolC.id, termsC, westbrookLessonTemplates);
  console.log(`Created ${multiSessionsC} lesson sessions for all Westbrook lesson templates\n`);

  const childCAuth = await prisma.auth.create({
    data: {
      username: "student_multi_c",
      email: "student_multi_c@demo.local",
      password: hashedPassword,
      role: "student",
      accountType: AccountType.STUDENT,
      schoolId: schoolC.id,
    },
  });
  const studentMultiC = await prisma.student.create({
    data: {
      username: "student_multi_c",
      name: "Morgan",
      surname: "Westbrook",
      email: "student_multi_c@demo.local",
      phone: "555-060-0003",
      address: "200 Family Ln",
      bloodType: "O-",
      sex: UserSex.FEMALE,
      birthday: new Date(2014, 2, 20),
      parentId: parentMulti.id,
      gradeId: gradesC[0]!.id,
      classId: classesC[0]!.id,
      schoolId: schoolC.id,
      authId: childCAuth.id,
    },
  });
  await prisma.schoolMembership.create({
    data: { authId: childCAuth.id, schoolId: schoolC.id, role: "student", studentId: studentMultiC.id },
  });
  await prisma.studentEnrollmentHistory.create({
    data: {
      studentId: studentMultiC.id,
      classId: classesC[0]!.id,
      academicYearId: academicYearC.id,
      enrollmentDate: new Date(`${ACADEMIC_YEAR_START}-09-01`),
      status: EnrollmentStatus.ENROLLED,
    },
  });
  console.log("Created student_multi_c (Westbrook) for parent_multi\n");

  // ─── TEACHER MARKETPLACE ──────────────────────

  // Enable marketplace for Springfield and Riverside
  await prisma.schoolMarketplaceSettings.create({
    data: { schoolId: school.id, isEnabled: true },
  });
  await prisma.schoolMarketplaceSettings.create({
    data: { schoolId: schoolB.id, isEnabled: true },
  });
  console.log("Enabled marketplace for Springfield and Riverside");

  // Marketplace profiles for some teachers (published)
  const marketplaceTeachers = [
    { teacher: teachers[0], headline: "Experienced Mathematics Educator", subjects: ["Mathematics", "AP Calculus", "Statistics"], city: "Casablanca", yearsOfExp: 12, rate: 150 },
    { teacher: teachers[1], headline: "Science & Physics Specialist", subjects: ["Physics", "Science", "Lab Instruction"], city: "Rabat", yearsOfExp: 8, rate: 120 },
    { teacher: teachers[2], headline: "English Literature & Language Arts", subjects: ["English", "Creative Writing", "ESL"], city: "Casablanca", yearsOfExp: 15, rate: 180 },
    { teacher: teachers[3], headline: "History & Social Studies Teacher", subjects: ["History", "Geography", "Civics"], city: "Marrakech", yearsOfExp: 6, rate: 100 },
    { teacher: teachers[4], headline: "Computer Science & IT Instructor", subjects: ["Computer Science", "Web Development", "Python"], city: "Tangier", yearsOfExp: 5, rate: 200 },
  ];

  for (const mp of marketplaceTeachers) {
    await prisma.teacherMarketplaceProfile.create({
      data: {
        teacherId: mp.teacher.id,
        headline: mp.headline,
        bio: `Passionate educator with ${mp.yearsOfExp} years of teaching experience. Specialized in ${mp.subjects.slice(0, 2).join(" and ")}.`,
        yearsOfExp: mp.yearsOfExp,
        hourlyRate: mp.rate,
        currency: "MAD",
        isPublished: true,
        subjectTags: mp.subjects,
        availableDays: ["MONDAY", "WEDNESDAY", "FRIDAY"],
        maxHoursPerWeek: 20,
        city: mp.city,
        country: "Morocco",
        willingToRelocate: mp.yearsOfExp > 10,
        offersOnline: mp.yearsOfExp > 7,
      },
    });
  }

  // One unpublished profile (teacher_multi)
  await prisma.teacherMarketplaceProfile.create({
    data: {
      teacherId: teacherMulti.id,
      headline: "Multi-school Math Instructor",
      bio: "Teaching across multiple schools with focus on mathematics and foundational science.",
      yearsOfExp: 10,
      hourlyRate: 160,
      isPublished: false,
      subjectTags: ["Mathematics", "Science"],
      availableDays: ["TUESDAY", "THURSDAY"],
      maxHoursPerWeek: 10,
      city: "Casablanca",
    },
  });
  console.log(`Created ${marketplaceTeachers.length + 1} marketplace profiles (${marketplaceTeachers.length} published)`);

  // Invitations: Riverside invites two Springfield teachers
  const inv1 = await prisma.marketplaceInvitation.create({
    data: {
      schoolId: schoolB.id,
      teacherId: teachers[0].id,
      status: MarketplaceInvitationStatus.ACCEPTED,
      message: "We need a strong math teacher for our advanced classes. Would you be interested?",
      proposedHoursPerWeek: 10,
      proposedHourlyRate: 150,
      respondedAt: new Date(),
    },
  });

  await prisma.marketplaceInvitation.create({
    data: {
      schoolId: schoolB.id,
      teacherId: teachers[2].id,
      status: MarketplaceInvitationStatus.PENDING,
      message: "We are looking for an English teacher for next term.",
      proposedHoursPerWeek: 8,
      proposedHourlyRate: 180,
    },
  });

  await prisma.marketplaceInvitation.create({
    data: {
      schoolId: school.id,
      teacherId: teachersRiverside[0].id,
      status: MarketplaceInvitationStatus.DECLINED,
      message: "Would you like to teach Physics at Springfield?",
      proposedHoursPerWeek: 12,
      respondedAt: new Date(),
    },
  });
  console.log("Created 3 marketplace invitations (1 accepted, 1 pending, 1 declined)");

  // Engagement from accepted invitation
  const membership1 = await prisma.schoolMembership.findFirst({
    where: { authId: teachers[0].authId, schoolId: schoolB.id, role: "teacher" },
  });
  let engMembershipId = membership1?.id;
  if (!engMembershipId) {
    const newMembership = await prisma.schoolMembership.create({
      data: {
        authId: teachers[0].authId,
        schoolId: schoolB.id,
        role: "teacher",
        teacherId: teachers[0].id,
      },
    });
    engMembershipId = newMembership.id;
  }

  const eng1 = await prisma.marketplaceEngagement.create({
    data: {
      invitationId: inv1.id,
      schoolId: schoolB.id,
      teacherId: teachers[0].id,
      membershipId: engMembershipId,
      status: EngagementStatus.ACTIVE,
      agreedHoursPerWeek: 10,
      agreedHourlyRate: 150,
      currency: "MAD",
    },
  });
  console.log("Created 1 active marketplace engagement");

  // School marketplace needs
  await prisma.schoolMarketplaceNeed.createMany({
    data: [
      {
        schoolId: school.id,
        title: "Physics Teacher Needed",
        description: "Looking for an experienced physics teacher for grades 4-6. Must be comfortable with lab instruction.",
        subjectTags: ["Physics", "Science", "Lab Instruction"],
        hoursPerWeek: 15,
      },
      {
        schoolId: school.id,
        title: "Part-time Art Instructor",
        description: "We need a creative art teacher for 2 days per week.",
        subjectTags: ["Art", "Creative Arts"],
        hoursPerWeek: 8,
      },
      {
        schoolId: schoolB.id,
        title: "Computer Science Teacher",
        description: "Riverside High is expanding its CS program. Looking for someone who can teach web development and Python.",
        subjectTags: ["Computer Science", "Python", "Web Development"],
        hoursPerWeek: 12,
      },
      {
        schoolId: schoolB.id,
        title: "Music Teacher (Temporary)",
        description: "Temporary replacement needed for our music program this term.",
        subjectTags: ["Music"],
        hoursPerWeek: 6,
      },
    ],
  });
  console.log("Created 4 marketplace needs (2 per school)\n");

  // ─── SUMMARY ──────────────────────────────────
  console.log("════════════════════════════════════════════");
  console.log("  SEED COMPLETE - LOGIN CREDENTIALS");
  console.log("════════════════════════════════════════════");
  console.log(`  Password for ALL accounts: ${COMMON_PASSWORD}`);
  console.log("");
  console.log("  System Admin:  sysadmin");
  console.log("  School Admin:  admin1");
  console.log("  Teachers:      teacher1 ... teacher15");
  console.log("  Parents:       parent1  ... parent30");
  console.log("  Students:      student1 ... student60");
  console.log("");
  console.log("  Multi-school (same password):");
  console.log("    teacher_multi   — Springfield + Riverside + Westbrook");
  console.log("    admin_multi     — all three schools");
  console.log("    parent_multi    — all three schools");
  console.log("    student_multi_a — Springfield");
  console.log("    student_multi_b — Riverside");
  console.log("    student_multi_c — Westbrook");
  console.log("    rv_teacher1–15  — Riverside only");
  console.log("    wb_teacher1–15  — Westbrook only");
  console.log("");
  console.log(`  School A:      ${school.name}`);
  console.log(`  School B:      Riverside High`);
  console.log(`  School C:      Westbrook Academy`);
  console.log(`  Academic Year: ${academicYear.name}`);
  console.log(`  Terms:         ${terms.map((t) => t.name).join(", ")}`);
  console.log(`  Join Codes:    ${joinCodes.map(j => j.code).join(", ")}`);
  console.log("");
  console.log("  Marketplace:");
  console.log("    Enabled:     Springfield, Riverside");
  console.log("    Profiles:    teacher1–5 (published), teacher_multi (draft)");
  console.log("    Invitations: 3 (1 accepted, 1 pending, 1 declined)");
  console.log("    Engagements: 1 active (teacher1 at Riverside)");
  console.log("    Needs:       4 (2 Springfield, 2 Riverside)");
  console.log("════════════════════════════════════════════\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
