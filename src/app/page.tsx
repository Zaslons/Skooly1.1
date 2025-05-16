"use client";

import Image from "next/image";
import Link from "next/link";
// import { useUser } from "@clerk/nextjs"; // Removed Clerk's useUser
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
// import { verifyToken, type AuthUser } from "@/lib/auth"; // No longer verify token client-side
import type { AuthUser } from "@/lib/auth"; // Still need AuthUser type

export default function Home() {
  // const { isLoaded, isSignedIn, user } = useUser(); // Removed Clerk state
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | null>(null); // Keep this to track if redirection logic has run

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const user: AuthUser = await response.json();
          setAuthenticatedUser(user); // Mark that we have an authenticated user
          if (user.schoolId) {
            router.push(`/schools/${user.schoolId}/${user.role}`);
          } else {
            router.push(`/create-school`);
          }
          // setLoading(false) will be called after redirection or if not redirecting
          // No need to return here, let setLoading(false) run below
        } else {
          // Not authenticated, or /api/auth/me failed for other reasons (e.g. 401)
          // Stay on the public home page
          setAuthenticatedUser(null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to check auth status for home page:", error);
        // Stay on public home page in case of error
        setAuthenticatedUser(null);
        setLoading(false);
      }
    };

    checkAuthAndRedirect();
  }, [router]);

  // If loading, or if authenticatedUser is set (meaning redirection logic has run and might be in progress)
  if (loading || authenticatedUser) {
    return (
      <div className="min-h-screen bg-lamaSkyLight flex items-center justify-center">
        <div className="text-center">
          <Image src="/logo.png" alt="Skooly Logo" width={48} height={48} className="mx-auto mb-4" />
          <p className="text-gray-600">Loading or redirecting...</p>
        </div>
      </div>
    );
  }

  // If not loading and not authenticated (no valid token found)
  return (
    <main className="min-h-screen bg-lamaSkyLight">
      <header className="p-6 flex justify-between items-center bg-white shadow-md">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Skooly Logo" width={32} height={32} />
          <h1 className="text-2xl font-bold text-gray-700">Skooly</h1>
        </div>
        <nav className="flex gap-4">
          <Link href="/sign-in" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
            Sign In
          </Link>
          {/* Link to a generic sign-up or create school page */}
          <Link href="/create-school" className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600">
            Create School / Sign Up
          </Link>
        </nav>
      </header>
      <section className="text-center py-20 px-4">
        <h2 className="text-5xl font-bold text-gray-800 mb-6">Welcome to Skooly!</h2>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          The all-in-one school management system designed to simplify administration, enhance communication, and empower educators.
        </p>
        <div className="flex justify-center gap-6">
          <Link href="/sign-in" className="px-8 py-3 bg-blue-500 text-white text-lg rounded-lg hover:bg-blue-600 transition duration-300">
            Get Started
          </Link>
          <Link href="#features" className="px-8 py-3 bg-transparent border-2 border-blue-500 text-blue-500 text-lg rounded-lg hover:bg-blue-500 hover:text-white transition duration-300">
            Learn More
          </Link>
        </div>
      </section>

      <section id="features" className="py-20 bg-white px-4">
        <h3 className="text-4xl font-bold text-center text-gray-800 mb-16">Features</h3>
        <div className="grid md:grid-cols-3 gap-10 max-w-6xl mx-auto">
          <div className="p-6 bg-gray-50 rounded-lg shadow-lg">
            <h4 className="text-2xl font-semibold text-gray-700 mb-3">Student Management</h4>
            <p className="text-gray-600">Track student records, attendance, grades, and more with ease.</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg shadow-lg">
            <h4 className="text-2xl font-semibold text-gray-700 mb-3">Teacher Tools</h4>
            <p className="text-gray-600">Empower teachers with tools for lesson planning, assignments, and communication.</p>
          </div>
          <div className="p-6 bg-gray-50 rounded-lg shadow-lg">
            <h4 className="text-2xl font-semibold text-gray-700 mb-3">Parent Portal</h4>
            <p className="text-gray-600">Keep parents informed with access to their child's progress and school announcements.</p>
          </div>
        </div>
      </section>

      <footer className="text-center py-10 bg-gray-800 text-white">
        <p>&copy; {new Date().getFullYear()} Skooly. All rights reserved.</p>
      </footer>
    </main>
  );
}