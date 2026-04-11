import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSchoolAccess } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const schoolId = params.schoolId;

  if (!schoolId) {
    return NextResponse.json({ error: 'School ID is required' }, { status: 400 });
  }

  const accessOrResponse = await requireSchoolAccess(request, schoolId);
  if (accessOrResponse instanceof NextResponse) return accessOrResponse;
  const authUser = accessOrResponse;

  try {
    const profileId = authUser.profileId ?? authUser.id;
    const role = authUser.role;

    let whereClause: any = {
      schoolId: schoolId,
    };

    // Role-based filtering logic adapted from the original component
    if (role !== 'admin') { // Admins see all announcements for the school
      const roleConditions: any = {
        // Teacher: sees announcements for their classes or general (no classId)
        teacher: {
          OR: [
            { classId: null },
            {
              class: {
                lessons: { some: { teacherId: profileId, schoolId: schoolId } },
              },
            },
          ],
        },
        // Student: sees announcements for their class or general
        student: {
          OR: [
            { classId: null },
            {
              class: {
                students: { some: { id: profileId, schoolId: schoolId } },
              },
            },
          ],
        },
        // Parent: sees announcements for their child's class or general
        parent: {
          OR: [
            { classId: null },
            {
              class: {
                students: { some: { parentId: profileId, schoolId: schoolId } },
              },
            },
          ],
        },
      };
      if (roleConditions[role]) {
        whereClause = {
          ...whereClause,
          ...roleConditions[role],
        };
      } else {
        // If role is not admin and not one of the above, they only see general announcements
        whereClause.classId = null;
      }
    }

    const announcements = await prisma.announcement.findMany({
      take: 10, // Or a reasonable limit, can be a query param
      orderBy: { createdAt: 'desc' },
      where: whereClause,
      include: { // Optional: include related data if needed by the frontend
        class: {
          select: { name: true } // Example: include class name
        }
      }
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('Failed to fetch announcements:', error);
    return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
  }
} 