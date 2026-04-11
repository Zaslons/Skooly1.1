import prisma from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { requireSchoolAccess } from "@/lib/auth";

// Schema for validating the request body when creating/updating a room
const roomSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  try {
    const accessOrResponse = await requireSchoolAccess(request, params.schoolId);
    if (accessOrResponse instanceof NextResponse) return accessOrResponse;

    const rooms = await prisma.room.findMany({
      where: {
        schoolId: params.schoolId,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(rooms);
  } catch (error) {
    console.error("[ROOMS_GET]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { schoolId: string } }
) {
  try {
    const accessOrResponse = await requireSchoolAccess(request, params.schoolId);
    if (accessOrResponse instanceof NextResponse) return accessOrResponse;
    const authUser = accessOrResponse;

    if (authUser.role !== 'system_admin' && authUser.role !== 'admin') {
      return NextResponse.json({ error: "Forbidden: Insufficient privileges" }, { status: 403 });
    }

    const body = await request.json();
    const validation = roomSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, type, capacity, description } = validation.data;

    const newRoom = await prisma.room.create({
      data: {
        name,
        type,
        capacity,
        description,
        schoolId: params.schoolId,
      },
    });

    return NextResponse.json(newRoom, { status: 201 });
  } catch (error: any) {
    console.error("[ROOMS_POST]", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name') && error.meta?.target?.includes('schoolId')) {
        return NextResponse.json({ error: "A room with this name already exists in this school." }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 