import { NextResponse } from "next/server";
import prisma from "@/lib/prisma"; // Corrected prisma import
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const signUpSchema = z.object({
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

    const { email, password } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.auth.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 } // 409 Conflict
      );
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Create new Auth record
    // For a generic sign-up, schoolId will be null initially.
    // The role might be a default one, or handled in a subsequent step.
    // Let's assume a default role like 'admin' for now, for users who sign up to create a school.
    // This can be adjusted based on your application flow.
    const newUser = await prisma.auth.create({
      data: {
        email,
        username: email, // Use email as username
        password: hashedPassword,
        role: "admin", // Default role for new sign-ups, adjust as needed
        // schoolId will be null by default
      },
    });

    // Return a success response (excluding password)
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