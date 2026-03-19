import { NextResponse } from "next/server";
import prisma from "@/lib/prisma"; // Corrected prisma import
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const signUpSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters long" }).max(30, { message: "Username must be at most 30 characters long" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters long" }),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = signUpSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors.map(e => e.message).join(', ') }, 
        { status: 400 }
      );
    }

    const { username, email, password } = validation.data;

    const [existingEmail, existingUsername] = await Promise.all([
      prisma.auth.findUnique({ where: { email } }),
      prisma.auth.findUnique({ where: { username } }),
    ]);

    if (existingEmail) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    if (existingUsername) {
      return NextResponse.json(
        { error: "This username is already taken." },
        { status: 409 }
      );
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.auth.create({
      data: {
        email,
        username,
        password: hashedPassword,
        role: "admin",
        accountType: "SCHOOL_ADMIN",
      },
    });

    return NextResponse.json(
      { message: "User registered successfully", userId: newUser.id, email: newUser.email, role: newUser.role },
      { status: 201 }
    );

  } catch (error) {
    console.error("Sign-up error:", error);
    return NextResponse.json(
      { error: "An internal server error occurred." },
      { status: 500 }
    );
  }
} 