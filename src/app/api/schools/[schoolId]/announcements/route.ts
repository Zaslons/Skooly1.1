import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import type { AuthUser } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  const schoolId = params.schoolId;

  if (!schoolId) {
    return NextResponse.json({ error: 'School ID is required' }, { status: 400 });
  }

  // Authenticate user
  const token = request.cookies.get('auth_token')?.value || request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const authUser = await verifyToken(token);
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Ensure user is accessing their own school or is an admin (additional checks can be added)
  if (authUser.schoolId !== schoolId && authUser.role !== 'admin') {
     // Non-admin users can only access their own school's announcements
     // Admins might have broader access, but for now, let's assume they also operate within a school context from the URL
     // Or, if your system allows admins to see all schools, this logic needs adjustment
    return NextResponse.json({ error: 'Forbidden: Access to this school\'s announcements is restricted.' }, { status: 403 });
  }


  try {
    const userId = authUser.id;
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
                lessons: { some: { teacherId: userId, schoolId: schoolId } },
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
                students: { some: { id: userId, schoolId: schoolId } },
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
                students: { some: { parentId: userId, schoolId: schoolId } },
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
      orderBy: { date: 'desc' },
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