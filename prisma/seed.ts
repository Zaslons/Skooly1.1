import {
  Day,
  PrismaClient,
  UserSex,
  BillingCycle,
  SubscriptionStatus,
  AttendanceStatus,
  AccountType,
  EnrollmentStatus,
  JoinCodeType,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COMMON_PASSWORD = "Password123!";

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

  // ─── ACADEMIC YEAR ───────────────────────────
  const currentYear = new Date().getFullYear();
  const academicYear = await prisma.academicYear.create({
    data: {
      name: `${currentYear}-${currentYear + 1}`,
      startDate: new Date(`${currentYear}-09-01`),
      endDate: new Date(`${currentYear + 1}-06-30`),
      schoolId: school.id,
      isActive: true,
    },
  });
  await prisma.school.update({ where: { id: school.id }, data: { activeAcademicYearId: academicYear.id } });
  console.log(`Created academic year: ${academicYear.name}\n`);

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
          description: `${subject.name} curriculum for Grade ${grade.level}`,
        },
      });
      curricula.push(c);
    }
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

  // ─── LESSONS (6 per class × 12 classes = 72 lessons) ────
  const days = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY];
  const lessons: { id: number; name: string; classId: number }[] = [];
  for (const cls of classes) {
    const gradeSubjects = subjects.slice(0, 6);
    for (let s = 0; s < gradeSubjects.length; s++) {
      const day = days[s % days.length];
      const hour = 8 + s;
      const teacher = teachers[s % teachers.length];
      const room = rooms[s % rooms.length];

      const lesson = await prisma.lesson.create({
        data: {
          name: `${gradeSubjects[s].name} - ${cls.name}`,
          day,
          startTime: new Date(currentYear, 8, 1, hour, 0),
          endTime: new Date(currentYear, 8, 1, hour + 1, 0),
          subjectId: gradeSubjects[s].id,
          classId: cls.id,
          teacherId: teacher.id,
          schoolId: school.id,
          roomId: room.id,
        },
      });
      lessons.push(lesson);
    }
  }
  console.log(`Created ${lessons.length} lessons`);

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
        enrollmentDate: new Date(`${currentYear}-09-01`),
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
        startTime: new Date(currentYear, i < 12 ? 10 : 2, randomInt(1, 15), 9, 0),
        endTime: new Date(currentYear, i < 12 ? 10 : 2, randomInt(1, 15), 11, 0),
        maxScore,
        weight: i < 12 ? 1.0 : 2.0,
        lessonId: lesson.id,
        schoolId: school.id,
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
        startDate: new Date(currentYear, 9, randomInt(1, 28)),
        dueDate: new Date(currentYear, 9, randomInt(1, 28) + 7),
        maxScore,
        weight: 0.5,
        lessonId: lesson.id,
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

  // ─── ATTENDANCE (last 30 school days for all students) ──────
  let attendanceCount = 0;
  for (const student of students) {
    const studentLessons = lessons.filter(l => l.classId === student.classId).slice(0, 4);
    for (let d = 0; d < 15; d++) {
      const date = new Date(currentYear, 9, d + 1);
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
  console.log(`  School:        ${school.name}`);
  console.log(`  Academic Year: ${academicYear.name}`);
  console.log(`  Join Codes:    ${joinCodes.map(j => j.code).join(", ")}`);
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
