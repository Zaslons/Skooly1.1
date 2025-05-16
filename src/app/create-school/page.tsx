"use client";

import { createSchoolAndAssignAdmin } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "react-toastify";
import type { AuthUser } from "@/lib/auth"; // Still need AuthUser type
import Image from "next/image"; // For loading state

function SubmitButton({ isNewUser }: { isNewUser: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
    >
      {pending
        ? isNewUser
          ? "Creating Account & School..."
          : "Creating School..."
        : isNewUser
        ? "Create Account & School"
        : "Create School and Continue"}
    </button>
  );
}

export default function CreateSchoolPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [state, formAction] = useFormState(createSchoolAndAssignAdmin, {
    success: false,
    error: false,
    message: "",
    schoolId: undefined,
    token: undefined, // Added to handle token from server action for new users
  });

  useEffect(() => {
    const checkAuthAndHandleRedirects = async () => {
      setLoadingAuth(true);
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const user: AuthUser = await response.json();
          if (user.schoolId) {
            toast.info("You already belong to a school. Redirecting...");
            router.push(`/schools/${user.schoolId}/${user.role}`);
            return; 
          }
          setAuthUser(user);
        } else {
          // Not authenticated or error from /api/auth/me
          setAuthUser(null); // Explicitly set to null for clarity
          if (response.status === 401) {
            // User is not signed in, allow them to create a school/sign up
            // toast.info("Create your school and an admin account."); // Optional: inform the user
          } else {
            toast.error("Could not verify your session. Please try again later.");
          }
        }
      } catch (error) {
        console.error("Failed to check auth status for create-school page:", error);
        setAuthUser(null);
        toast.error("An error occurred while checking your authentication status.");
        // Do not redirect to sign-in, allow form display
      }
      setLoadingAuth(false);
    };
    checkAuthAndHandleRedirects();
  }, [router]);

  useEffect(() => {
    if (state.success && state.schoolId) {
      toast.success(state.message || "School created successfully! Redirecting...");
      if (state.token) {
        // If a token was returned (new user), we need to set it.
        // This is a simplified way; ideally, an API route would set an HttpOnly cookie.
        // For now, let's assume the action or a subsequent step handles cookie setting.
        // We can refine this to call an API route to set the cookie.
        fetch('/api/auth/set-token', { // We'll need to create this API route
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: state.token }),
        }).then(res => {
            if (res.ok) {
                 window.location.href = `/schools/${state.schoolId}/${authUser?.role || 'admin'}`;
            } else {
                toast.error("Session could not be started. Please try signing in.");
                router.push('/sign-in');
            }
        }).catch(() => {
            toast.error("Error setting up session. Please try signing in.");
            router.push('/sign-in');
        });
      } else {
        // Existing authenticated user, no new token needed
        window.location.href = `/schools/${state.schoolId}/${authUser?.role || 'admin'}`;
      }
    }
    if (state.error && state.message) {
      toast.error(`${state.message}`);
    }
  }, [state, router, authUser?.role]); // state is the dependency

  if (loadingAuth) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <Image src="/logo.png" alt="Skooly Logo" width={64} height={64} className="mb-4 animate-pulse" />
            <p className="text-lg text-gray-700">Loading...</p>
        </div>
    );
  }

  // No redirect here if !authUser. The form below handles both cases.

  const isNewUser = !authUser;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        {authUser ? (
          <>
            <h1 className="text-2xl font-bold text-center text-gray-900">
              Welcome, {authUser.email}!
            </h1>
            <p className="text-center text-gray-600">
              Let&apos;s set up your school. Please enter the name of your school below.
              You will be assigned as the administrator.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-center text-gray-900">
              Create Your School & Admin Account
            </h1>
            <p className="text-center text-gray-600">
              Enter your email, choose a password, and name your school to get started.
            </p>
          </>
        )}
        <form action={formAction} className="space-y-6">
          {authUser && (
            <>
              <input type="hidden" name="userId" value={authUser.id} />
              <input type="hidden" name="userEmail" value={authUser.email ?? ""} />
            </>
          )}

          {!authUser && (
            <>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Your Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700"
                >
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          <div>
            <label
              htmlFor="schoolName"
              className="block text-sm font-medium text-gray-700"
            >
              School Name
            </label>
            <input
              id="schoolName"
              name="schoolName"
              type="text"
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="e.g., Springfield Elementary"
            />
            {state.error && state.message?.includes("name") && (
                 <p className="mt-2 text-sm text-red-600">{state.message}</p>
            )}
          </div>
          <div>
            <SubmitButton isNewUser={isNewUser} />
          </div>
          {state.error && !state.message?.includes("name") && (
             <p className="mt-2 text-sm text-center text-red-600">{state.message}</p>
          )}
        </form>
      </div>
    </div>
  );
} 