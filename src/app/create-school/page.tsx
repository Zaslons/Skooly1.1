"use client";

import { createSchoolAndAssignAdmin } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "react-toastify";
import type { AuthUser } from "@/lib/auth"; // Still need AuthUser type
import Image from "next/image"; // For loading state
import Link from "next/link";

function SubmitButton({ isNewUser }: { isNewUser: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-5 flex-1 bg-[#bf633f] text-[#fbf9f9] text-base font-bold leading-normal tracking-[0.015em] disabled:bg-[#e2d8d4]"
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F5F3F0]">
        <Image src="/logo.png" alt="Skooly Logo" width={64} height={64} className="mb-4 animate-pulse" />
        <p className="text-lg text-gray-700">Loading...</p>
      </div>
    );
  }

  // No redirect here if !authUser. The form below handles both cases.

  const isNewUser = !authUser;

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-[#F5F3F0] group/design-root overflow-x-hidden" style={{ fontFamily: 'Inter, \"Noto Sans\", sans-serif' }}>
      <div className="layout-container flex h-full grow flex-col">
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#f1ecea] px-10 py-3">
          <Link href="/" className="flex items-center gap-4 text-[#181310]">
            <div className="size-4 flex items-center justify-center">
              <Image src="/logo.png" alt="Skooly Logo" width={24} height={24} />
            </div>
            <h2 className="text-[#181310] text-lg font-bold leading-tight tracking-[-0.015em]">Skooly</h2>
          </Link>
          <div className="flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Features</Link>
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Pricing</Link>
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Resources</Link>
            </div>
            <Link
              href="/sign-in"
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#f1ecea] text-[#181310] text-sm font-bold leading-normal tracking-[0.015em]"
            >
              <span className="truncate">Log In</span>
            </Link>
          </div>
        </header>
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col w-[512px] max-w-[512px] py-5 max-w-[960px] flex-1">
            <h2 className="text-[#181310] tracking-light text-[28px] font-bold leading-tight px-4 text-center pb-3 pt-5">
              {authUser ? "Set Up Your School" : "Create Your School & Admin Account"}
            </h2>
            <p className="text-center text-gray-600 mb-2">
              {authUser
                ? "Let's set up your school. Please enter the name of your school below. You will be assigned as the administrator."
                : "Enter your email, choose a password, and name your school to get started."}
            </p>
            {state.error && <p className="text-sm text-red-500 bg-red-100 p-3 rounded-md mb-2">{state.message}</p>}
            {state.success && <p className="text-sm text-green-600 bg-green-100 p-3 rounded-md mb-2">{state.message}</p>}
            <form action={formAction} className="flex flex-col gap-0">
              {authUser && (
                <>
                  <input type="hidden" name="userId" value={authUser.id} />
                  <input type="hidden" name="userEmail" value={authUser.email ?? ""} />
                </>
              )}
              {!authUser && (
                <>
                  <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                    <label className="flex flex-col min-w-40 flex-1">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                        placeholder="Your Email"
                      />
                    </label>
                  </div>
                  <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                    <label className="flex flex-col min-w-40 flex-1">
                      <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={8}
                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                        placeholder="Password"
                      />
                    </label>
                  </div>
                  <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                    <label className="flex flex-col min-w-40 flex-1">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required
                        className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                        placeholder="Confirm Password"
                      />
                    </label>
                  </div>
                </>
              )}
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <input
                    id="schoolName"
                    name="schoolName"
                    type="text"
                    required
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                    placeholder="School Name"
                  />
                </label>
                {state.error && state.message?.includes("name") && (
                  <p className="mt-2 text-sm text-red-600">{state.message}</p>
                )}
              </div>
              <div className="flex px-4 py-3">
                <SubmitButton isNewUser={isNewUser} />
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
} 