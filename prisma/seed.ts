import { Day, PrismaClient, UserSex, BillingCycle, SubscriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Seed System Admin
  const systemAdminUsername = process.env.SYSTEM_ADMIN_USERNAME || 'sysadmin';
  const systemAdminEmail = process.env.SYSTEM_ADMIN_EMAIL || 'sysadmin@example.com';
  const systemAdminPassword = process.env.SYSTEM_ADMIN_PASSWORD || 'StrongPassword123!';
  const hashedSystemAdminPassword = await bcrypt.hash(systemAdminPassword, 10);

  let sysAdminAuth = await prisma.auth.findUnique({
    where: { username: systemAdminUsername },
    include: { systemAdmin: true }, // Include to check if profile exists
  });

  if (!sysAdminAuth) {
    sysAdminAuth = await prisma.auth.create({
      data: {
        username: systemAdminUsername,
        email: systemAdminEmail, // Ensure this is unique or handle potential conflicts
        password: hashedSystemAdminPassword,
        role: 'system_admin',
        schoolId: null, // System admin is not tied to a specific school
        systemAdmin: {
          create: {
            name: 'System Administrator',
          },
        },
      },
      include: {
        systemAdmin: true,
      },
    });
    console.log('Created system admin:', sysAdminAuth.username, sysAdminAuth.email);
  } else {
    console.log('System admin already exists:', sysAdminAuth.username);
    // Ensure the SystemAdmin profile exists if Auth record was found but profile wasn't linked
    if (!sysAdminAuth.systemAdmin) {
      await prisma.systemAdmin.upsert({
        where: { authId: sysAdminAuth.id },
        update: {
          name: 'System Administrator (Profile Updated)',
        },
        create: {
          authId: sysAdminAuth.id,
          name: 'System Administrator',
        },
      });
      console.log(`Ensured SystemAdmin profile exists for ${sysAdminAuth.username}`);
    }
  }

  // Example: Seed some Subscription Plans
  const plansToSeed = [
    {
      name: 'Basic Monthly',
      price: 10.00,
      currency: 'USD',
      billingCycle: BillingCycle.MONTHLY,
      stripePriceId: 'price_basic_monthly_placeholder',
      features: ['Up to 50 students', 'Up to 5 teachers', 'Basic support'],
      isActive: true,
    },
    {
      name: 'Premium Yearly',
      price: 1000.00,
      currency: 'USD',
      billingCycle: BillingCycle.YEARLY,
      stripePriceId: 'price_premium_yearly_placeholder',
      features: ['Unlimited students', 'Unlimited teachers', 'Priority support', 'Advanced reporting'],
      isActive: true,
    },
    {
      name: 'Free Trial',
      price: 0.00,
      currency: 'USD',
      billingCycle: BillingCycle.MONTHLY,
      stripePriceId: 'price_free_trial_placeholder',
      features: ['Full access for 14 days', 'Up to 10 students'],
      isActive: true,
    },
  ];

  for (const planData of plansToSeed) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { name: planData.name },
      update: { ...planData },
      create: { ...planData },
    });
    console.log(`Upserted subscription plan: ${plan.name}`);
  }

  // --- Create a default School first ---
  const school1 = await prisma.school.create({
    data: {
      name: "Default Seed School",
    },
  });
  console.log(`Created school with id: ${school1.id}`);

  // --- Create a default AcademicYear for the School ---
  const currentYear = new Date().getFullYear();
  const academicYear = await prisma.academicYear.create({
    data: {
      name: `${currentYear}-${currentYear + 1}`,
      startDate: new Date(`${currentYear}-09-01`),
      endDate: new Date(`${currentYear + 1}-06-30`),
      schoolId: school1.id,
      isActive: true, // Set this as the active year for the school
    },
  });
  console.log(`Created academic year: ${academicYear.name} for school ${school1.id}`);

  // Update school to set this as the active academic year
  await prisma.school.update({
    where: { id: school1.id },
    data: { activeAcademicYearId: academicYear.id },
  });
  console.log(`Set ${academicYear.name} as active for school ${school1.id}`);

  // ADMIN (example for 2 admins)
  for (let i = 1; i <= 2; i++) {
    const adminUsername = `admin${i}`;
    const adminEmail = `admin${i}@example.com`;

    let auth = await prisma.auth.findUnique({
      where: { username: adminUsername },
    });

    if (auth) {
      console.log(`Auth for admin ${adminUsername} already exists. Checking/creating Admin profile.`);
      let adminProfile = await prisma.admin.findUnique({ where: { username: adminUsername } });
      if (!adminProfile) {
        adminProfile = await prisma.admin.create({
          data: {
            id: adminUsername, // Assuming id can be the same as username for simplicity here
            username: adminUsername,
            schoolId: school1.id,
            authId: auth.id,
            name: `Admin${i}Name`, // Added placeholder name
            surname: `Admin${i}Surname`, // Added placeholder surname
          },
        });
        console.log(`Created Admin profile for ${adminUsername}`);
      } else {
        console.log(`Admin profile for ${adminUsername} already exists.`);
      }
      continue;
    }

    const password = await bcrypt.hash(`admin${i}pass`, 10);
    auth = await prisma.auth.create({
      data: {
        username: adminUsername,
        email: adminEmail,
        password,
        role: "admin",
        schoolId: school1.id,
      },
    });
    await prisma.admin.create({
      data: {
        id: adminUsername, // Assuming id can be the same as username
        username: adminUsername,
        schoolId: school1.id,
        authId: auth.id,
        name: `Admin${i}Name`, // Added placeholder name
        surname: `Admin${i}Surname`, // Added placeholder surname
      },
    });
    console.log(`Created admin and auth: ${adminUsername}`);
  }

  // GRADE
  for (let i = 1; i <= 6; i++) {
    await prisma.grade.create({
      data: {
        level: i.toString(),
        schoolId: school1.id,
      },
    });
  }
  console.log("Created grades");

  // CLASS
  const grades = await prisma.grade.findMany({ where: { schoolId: school1.id }});
  for (let i = 1; i <= 6; i++) {
    const gradeForClass = grades.find(g => g.level === i.toString());
    if (gradeForClass) {
    await prisma.class.create({
      data: {
        name: `${i}A`, 
          gradeId: gradeForClass.id, 
        capacity: Math.floor(Math.random() * (20 - 15 + 1)) + 15,
        schoolId: school1.id,
          academicYearId: academicYear.id,
      },
    });
  }
  }
  console.log("Created classes");

  // SUBJECT
  const subjectData = [
    { name: "Mathematics" },
    { name: "Science" },
    { name: "English" },
    { name: "History" },
    { name: "Geography" },
    { name: "Physics" },
    { name: "Chemistry" },
    { name: "Biology" },
    { name: "Computer Science" },
    { name: "Art" },
  ];

  for (const subject of subjectData) {
    await prisma.subject.create({
      data: {
        ...subject,
        schoolId: school1.id,
      }
    });
  }

  // TEACHER
  const schoolSubjects = await prisma.subject.findMany({
    where: { schoolId: school1.id },
    select: { id: true },
  });
  const schoolSubjectIds = schoolSubjects.map(s => s.id);

  const schoolClasses = await prisma.class.findMany({
    where: { schoolId: school1.id },
    select: { id: true },
  });
  const schoolClassIds = schoolClasses.map(c => c.id);

  for (let i = 1; i <= 15; i++) {
    const teacherUsername = `teacher${i}`;
    const teacherEmail = `teacher${i}@example.com`;

    let auth = await prisma.auth.findUnique({
      where: { username: teacherUsername },
    });

    const connectSubjectId = schoolSubjectIds[i % schoolSubjectIds.length];
    const connectClassId = schoolClassIds[i % schoolClassIds.length];

    if (auth) {
      console.log(`Auth for teacher ${teacherUsername} already exists. Checking/creating Teacher profile.`);
      let teacherProfile = await prisma.teacher.findUnique({ where: { username: teacherUsername }});
      if (!teacherProfile) {
        await prisma.teacher.create({
          data: {
            id: teacherUsername,
            username: teacherUsername,
            name: `TName${i}`,
            surname: `TSurname${i}`,
            email: teacherEmail,
            phone: `123-456-789${i}`,
            address: `Address${i}`,
            bloodType: "A+",
            sex: i % 2 === 0 ? UserSex.MALE : UserSex.FEMALE,
            birthday: new Date(new Date().setFullYear(new Date().getFullYear() - 30)),
            schoolId: school1.id,
            subjects: { connect: [{ id: connectSubjectId }] },
            classes: { connect: [{ id: connectClassId }] },
            authId: auth.id,
          },
        });
        console.log(`Created Teacher profile for ${teacherUsername}`);
      } else {
         console.log(`Teacher profile for ${teacherUsername} already exists.`);
      }
      continue;
    }

    const password = await bcrypt.hash(`teacher${i}pass`, 10);
    auth = await prisma.auth.create({
      data: {
        username: teacherUsername,
        email: teacherEmail,
        password,
        role: "teacher",
        schoolId: school1.id,
      },
    });
    await prisma.teacher.create({
      data: {
        id: teacherUsername,
        username: teacherUsername,
        name: `TName${i}`,
        surname: `TSurname${i}`,
        email: teacherEmail,
        phone: `123-456-789${i}`,
        address: `Address${i}`,
        bloodType: "A+",
        sex: i % 2 === 0 ? UserSex.MALE : UserSex.FEMALE,
        birthday: new Date(new Date().setFullYear(new Date().getFullYear() - 30)),
        schoolId: school1.id,
        subjects: { connect: [{ id: connectSubjectId }] },
        classes: { connect: [{ id: connectClassId }] },
        authId: auth.id,
      },
    });
    console.log(`Created teacher and auth: ${teacherUsername}`);
  }

  // LESSON
  const schoolTeachers = await prisma.teacher.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolTeacherIds = schoolTeachers.map(t => t.id);

  for (let i = 1; i <= 30; i++) {
    const lessonSubjectId = schoolSubjectIds[i % schoolSubjectIds.length];
    const lessonClassId = schoolClassIds[i % schoolClassIds.length];
    const lessonTeacherId = schoolTeacherIds[i % schoolTeacherIds.length];

    await prisma.lesson.create({
      data: {
        name: `Lesson${i}`, 
        day: Day[
          Object.keys(Day)[
            Math.floor(Math.random() * Object.keys(Day).length)
          ] as keyof typeof Day
        ], 
        startTime: new Date(new Date().setHours(new Date().getHours() + 1)), 
        endTime: new Date(new Date().setHours(new Date().getHours() + 3)), 
        subjectId: lessonSubjectId,
        classId: lessonClassId,
        teacherId: lessonTeacherId,
        schoolId: school1.id,
      },
    });
  }

  // PARENT
  for (let i = 1; i <= 25; i++) {
    const parentUsername = `parent${i}`; // Auth username
    const parentProfileUsername = `parentId${i}`; // Parent profile username as per original script
    const parentEmail = `parent${i}@example.com`;

    let auth = await prisma.auth.findUnique({
      where: { username: parentUsername },
    });

    if (auth) {
      console.log(`Auth for parent ${parentUsername} already exists. Checking/creating Parent profile.`);
      let parentProfile = await prisma.parent.findUnique({where: { username: parentProfileUsername }});
      if (!parentProfile) {
         await prisma.parent.create({
          data: {
            id: parentProfileUsername,
            username: parentProfileUsername,
            name: `PName ${i}`,
            surname: `PSurname ${i}`,
            email: parentEmail,
            phone: `123-456-789${i}`,
            address: `Address${i}`,
            schoolId: school1.id,
            authId: auth.id,
          },
        });
        console.log(`Created Parent profile for ${parentProfileUsername} (auth ${parentUsername})`);
      } else {
        console.log(`Parent profile ${parentProfileUsername} already exists.`);
      }
      continue;
    }

    const password = await bcrypt.hash(`parent${i}pass`, 10);
    auth = await prisma.auth.create({
      data: {
        username: parentUsername,
        email: parentEmail,
        password,
        role: "parent",
        schoolId: school1.id,
      },
    });
    await prisma.parent.create({
      data: {
        id: parentProfileUsername,
        username: parentProfileUsername,
        name: `PName ${i}`,
        surname: `PSurname ${i}`,
        email: parentEmail,
        phone: `123-456-789${i}`,
        address: `Address${i}`,
        schoolId: school1.id,
        authId: auth.id,
      },
    });
    console.log(`Created parent and auth: ${parentUsername}`);
  }

  // STUDENT
  const schoolParents = await prisma.parent.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolParentIds = schoolParents.map(p => p.id);

  const schoolGrades = await prisma.grade.findMany({
    where: { schoolId: school1.id },
    select: { id: true },
  });
  const schoolGradeIds = schoolGrades.map(g => g.id);

  for (let i = 1; i <= 50; i++) {
    const studentUsername = `student${i}`;
    const studentEmail = `student${i}@example.com`;

    let auth = await prisma.auth.findUnique({
      where: { username: studentUsername },
    });
    
    const studentParentId = schoolParentIds[Math.ceil(i / 2) % schoolParentIds.length || 0];
    const studentGradeId = schoolGradeIds[i % schoolGradeIds.length];
    const studentClassId = schoolClassIds[i % schoolClassIds.length];

    if (auth) {
      console.log(`Auth for student ${studentUsername} already exists. Checking/creating Student profile.`);
      let studentProfile = await prisma.student.findUnique({ where: {username: studentUsername }});
      if(!studentProfile) {
        await prisma.student.create({
          data: {
            id: studentUsername, 
            username: studentUsername, 
            name: `SName${i}`,
            surname: `SSurname ${i}`,
            email: studentEmail,
            phone: `987-654-321${i}`,
            address: `Address${i}`,
            bloodType: "O-",
            sex: i % 2 === 0 ? UserSex.MALE : UserSex.FEMALE,
            birthday: new Date(new Date().setFullYear(new Date().getFullYear() - 10)),
            parentId: studentParentId,
            gradeId: studentGradeId,
            classId: studentClassId,
            schoolId: school1.id,
            authId: auth.id,
          },
        });
        console.log(`Created Student profile for ${studentUsername}`);
      } else {
        console.log(`Student profile for ${studentUsername} already exists.`);
      }
      continue;
    }

    const password = await bcrypt.hash(`student${i}pass`, 10);
    auth = await prisma.auth.create({
      data: {
        username: studentUsername,
        email: studentEmail,
        password,
        role: "student",
        schoolId: school1.id,
      },
    });
    await prisma.student.create({
      data: {
        id: studentUsername, 
        username: studentUsername, 
        name: `SName${i}`,
        surname: `SSurname ${i}`,
        email: studentEmail,
        phone: `987-654-321${i}`,
        address: `Address${i}`,
        bloodType: "O-",
        sex: i % 2 === 0 ? UserSex.MALE : UserSex.FEMALE,
        birthday: new Date(new Date().setFullYear(new Date().getFullYear() - 10)),
        parentId: studentParentId,
        gradeId: studentGradeId,
        classId: studentClassId,
        schoolId: school1.id,
        authId: auth.id,
      },
    });
    console.log(`Created student and auth: ${studentUsername}`);
  }

  // EXAM
  const schoolLessons = await prisma.lesson.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolLessonIds = schoolLessons.map(l => l.id);

  for (let i = 1; i <= 10; i++) {
    const examLessonId = schoolLessonIds[i % schoolLessonIds.length];

    await prisma.exam.create({
      data: {
        title: `Exam ${i}`, 
        startTime: new Date(new Date().setHours(new Date().getHours() + 1)), 
        endTime: new Date(new Date().setHours(new Date().getHours() + 2)), 
        lessonId: examLessonId,
        schoolId: school1.id,
      },
    });
  }

  // ASSIGNMENT
  for (let i = 1; i <= 10; i++) {
    const assignmentLessonId = schoolLessonIds[i % schoolLessonIds.length];

    await prisma.assignment.create({
      data: {
        title: `Assignment ${i}`, 
        startDate: new Date(), 
        dueDate: new Date(new Date().setDate(new Date().getDate() + 7)), 
        lessonId: assignmentLessonId,
        schoolId: school1.id,
      },
    });
  }

  // RESULT
  const schoolExams = await prisma.exam.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolExamIds = schoolExams.map(e => e.id);

  const schoolAssignments = await prisma.assignment.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolAssignmentIds = schoolAssignments.map(a => a.id);

  const schoolStudents = await prisma.student.findMany({
    where: { schoolId: school1.id },
    select: { id: true }
  });
  const schoolStudentIds = schoolStudents.map(s => s.id);

  for (let i = 1; i <= 10; i++) {
    const resultStudentId = schoolStudentIds[i % schoolStudentIds.length];
    const resultData = i % 2 === 0 ?
        { examId: schoolExamIds[i % schoolExamIds.length] } :
        { assignmentId: schoolAssignmentIds[i % schoolAssignmentIds.length] };

    await prisma.result.create({
      data: {
        ...resultData,
        score: Math.floor(Math.random() * 101),
        studentId: resultStudentId,
        schoolId: school1.id,
      },
    });
  }

  // ATTENDANCE
  for (let i = 1; i <= 10; i++) {
    const attendanceStudentId = schoolStudentIds[i % schoolStudentIds.length];
    const attendanceLessonId = schoolLessonIds[i % schoolLessonIds.length];

    await prisma.attendance.create({
      data: {
        date: new Date(), 
        status: "Present",
        studentId: attendanceStudentId,
        lessonId: attendanceLessonId,
        schoolId: school1.id,
      },
    });
  }

  // EVENT
  for (let i = 1; i <= 5; i++) {
    const eventClassId = schoolClassIds[i % schoolClassIds.length];

    await prisma.event.create({
      data: {
        title: `Event ${i}`, 
        description: `Description for event ${i}`, 
        startTime: new Date(new Date().setDate(new Date().getDate() + i)), 
        endTime: new Date(new Date().setDate(new Date().getDate() + i + 1)), 
        classId: eventClassId,
        schoolId: school1.id,
      },
    });
  }

  // ANNOUNCEMENT
  for (let i = 1; i <= 5; i++) {
    const announcementClassId = schoolClassIds[i % schoolClassIds.length];

    await prisma.announcement.create({
      data: {
        title: `Announcement ${i}`, 
        content: `Description for announcement ${i}`,
        classId: announcementClassId,
        schoolId: school1.id,
      },
    });
  }

  console.log("Seeding completed successfully.");
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
