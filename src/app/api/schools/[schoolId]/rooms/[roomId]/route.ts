import prisma from "@/lib/prisma";
import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { getVerifiedAuthUser } from "@/lib/actions";

// Schema for validating the request body when creating/updating a room
// (Same as in the other route file, could be shared from a common location)
const roomSchema = z.object({
  name: z.string().min(1, "Name is required").optional(), // Optional for PUT if only some fields are updated
  type: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  description: z.string().optional(),
});

// Helper to check if room belongs to the school
async function verifyRoomBelongsToSchool(roomId: number, schoolId: string) {
    const room = await prisma.room.findUnique({
        where: { id: roomId },
    });
    if (!room || room.schoolId !== schoolId) {
        return null;
    }
    return room;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { schoolId: string; roomId: string } }
) {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    if (authUser.schoolId !== params.schoolId && authUser.role !== 'system_admin') {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const roomIdInt = parseInt(params.roomId, 10);
    if (isNaN(roomIdInt)) {
      return NextResponse.json({ error: "Invalid Room ID" }, { status: 400 });
    }

    const room = await verifyRoomBelongsToSchool(roomIdInt, params.schoolId);

    if (!room) {
      return NextResponse.json({ error: "Room not found or does not belong to this school" }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error("[ROOM_GET_BY_ID]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { schoolId: string; roomId: string } }
) {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    if (authUser.role !== 'system_admin' && (authUser.role !== 'admin' || authUser.schoolId !== params.schoolId)) {
        return NextResponse.json({ error: "Forbidden: Insufficient privileges" }, { status: 403 });
    }

    const roomIdInt = parseInt(params.roomId, 10);
    if (isNaN(roomIdInt)) {
      return NextResponse.json({ error: "Invalid Room ID" }, { status: 400 });
    }

    const existingRoom = await verifyRoomBelongsToSchool(roomIdInt, params.schoolId);
    if (!existingRoom) {
      return NextResponse.json({ error: "Room not found or does not belong to this school for update" }, { status: 404 });
    }

    const body = await request.json();
    const validation = roomSchema.partial().safeParse(body); // .partial() allows partial updates

    if (!validation.success) {
      return NextResponse.json({ error: "Invalid input", details: validation.error.flatten() }, { status: 400 });
    }

    const { name, type, capacity, description } = validation.data;

    // Prevent updating with a name that already exists for another room in the same school
    if (name && name !== existingRoom.name) {
        const nameConflict = await prisma.room.findFirst({
            where: {
                name: name,
                schoolId: params.schoolId,
                id: { not: roomIdInt }
            }
        });
        if (nameConflict) {
            return NextResponse.json({ error: "A room with this name already exists in this school." }, { status: 409 });
        }
    }

    const updatedRoom = await prisma.room.update({
      where: {
        id: roomIdInt,
        // Redundant check due to verifyRoomBelongsToSchool, but good for safety
        schoolId: params.schoolId, 
      },
      data: {
        name,
        type,
        capacity,
        description,
      },
    });

    return NextResponse.json(updatedRoom);
  } catch (error: any) {
    console.error("[ROOM_PUT]", error);
     if (error.code === 'P2002' && error.meta?.target?.includes('name') && error.meta?.target?.includes('schoolId')) {
        return NextResponse.json({ error: "A room with this name already exists in this school." }, { status: 409 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { schoolId: string; roomId: string } }
) {
  try {
    const authUser = await getVerifiedAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    if (authUser.role !== 'system_admin' && (authUser.role !== 'admin' || authUser.schoolId !== params.schoolId)) {
        return NextResponse.json({ error: "Forbidden: Insufficient privileges" }, { status: 403 });
    }

    const roomIdInt = parseInt(params.roomId, 10);
    if (isNaN(roomIdInt)) {
      return NextResponse.json({ error: "Invalid Room ID" }, { status: 400 });
    }

    const roomToDelete = await verifyRoomBelongsToSchool(roomIdInt, params.schoolId);
    if (!roomToDelete) {
      return NextResponse.json({ error: "Room not found or does not belong to this school" }, { status: 404 });
    }

    // Consider implications: what happens to Lessons or Events scheduled in this room?
    // The schema sets onDelete: SetNull for room relations in Lesson and Event.
    // This means lesson.roomId and event.roomId will become null if the room is deleted.
    // You might want to add checks here: e.g., prevent deletion if room is currently in use by active lessons/events,
    // or warn the user.

    await prisma.room.delete({
      where: {
        id: roomIdInt,
        schoolId: params.schoolId, // Ensure it's the correct school
      },
    });

    return NextResponse.json({ message: "Room deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("[ROOM_DELETE]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 