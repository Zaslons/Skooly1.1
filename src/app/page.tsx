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
      <div className="min-h-screen bg-[#F5F3F0] flex items-center justify-center">
        <div className="text-center">
          <Image src="/logo.png" alt="Skooly Logo" width={48} height={48} className="mx-auto mb-4" />
          <p className="text-[#8a695c]">Loading or redirecting...</p>
        </div>
      </div>
    );
  }

  // If not loading and not authenticated (no valid token found)
  return (
    <div className="relative flex size-full min-h-screen flex-col bg-[#F5F3F0] group/design-root overflow-x-hidden" style={{ fontFamily: 'Inter, "Noto Sans", sans-serif' }}>
      <div className="layout-container flex h-full grow flex-col">
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#f1ecea] px-10 py-3">
          <div className="flex items-center gap-4 text-[#181310]">
            <div className="size-4 flex items-center justify-center">
              <Image src="/logo.png" alt="Skooly Logo" width={24} height={24} />
            </div>
            <h2 className="text-[#181310] text-lg font-bold leading-tight tracking-[-0.015em]">Skooly</h2>
          </div>
          <div className="flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <Link href="#" className="text-[#181310] text-sm font-medium leading-normal">Home</Link>
              <Link href="#" className="text-[#181310] text-sm font-medium leading-normal">Features</Link>
              <Link href="#" className="text-[#181310] text-sm font-medium leading-normal">Pricing</Link>
              <Link href="#" className="text-[#181310] text-sm font-medium leading-normal">Contact</Link>
            </div>
            <div className="flex items-center gap-3 ml-6">
              <Link
                href="/join"
                className="text-[#bf633f] text-sm font-medium leading-normal hover:underline"
              >
                Join with a code
              </Link>
              <Link
                href="/sign-in"
                className="flex items-center justify-center min-w-[84px] h-10 px-4 rounded-full border border-[#bf633f] text-[#bf633f] text-sm font-bold leading-normal tracking-[0.015em] bg-transparent transition-colors hover:bg-[#f5f3f0] focus:outline-none"
              >
                <span className="truncate">Sign In</span>
              </Link>
              <Link
                href="/sign-up"
                className="flex items-center justify-center min-w-[84px] h-10 px-4 rounded-full bg-[#bf633f] text-[#fbf9f9] text-sm font-bold leading-normal tracking-[0.015em] transition-colors hover:bg-[#a94e2e] focus:outline-none"
              >
                <span className="truncate">Get Started</span>
              </Link>
            </div>
          </div>
        </header>

        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col max-w-[960px] flex-1">
            <div className="@container">
              <div className="@[480px]:p-4">
                <div
                  className="flex min-h-[480px] flex-col gap-6 bg-cover bg-center bg-no-repeat @[480px]:gap-8 @[480px]:rounded-xl items-center justify-center p-4"
                  style={{
                    backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.4) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuD6I0CxSJnSOCqZ2UXOyDbv6TNCa2MFWyyv6MTuXX0MhuXoBCplJDaBKVG3kJiOQTyJkRBxY6QrTt1Qv9e0KgmDV3TL3I90KWAOji2nIEGGW9iassAtS8a4D2xTnG4FxRi_DjFNVg-TBJqTeME0L_ZsCCayA3JFcbJfJIfBmbfM8Cc_dvreSYJp8EerWpRu46AcKFMzGqJsFzv3bYXnUh9qNmzpoAIDSeGUTVx4kZ6GZjoHtW2oGwp_8D0Q-xrQ9_nu7oUSOfmwHlCu")'
                  }}
                >
                  <div className="flex flex-col gap-2 text-center">
                    <h1 className="text-white text-4xl font-black leading-tight tracking-[-0.033em] @[480px]:text-5xl @[480px]:font-black @[480px]:leading-tight @[480px]:tracking-[-0.033em]">
                      Empowering Education with Skooly
                    </h1>
                    <h2 className="text-white text-sm font-normal leading-normal @[480px]:text-base @[480px]:font-normal @[480px]:leading-normal">
                      Skooly is a comprehensive school management system designed to streamline administrative tasks, enhance teaching effectiveness, and improve student outcomes.
                    </h2>
                  </div>
                  <Link
                    href="/sign-up"
                    className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 @[480px]:h-12 @[480px]:px-5 bg-[#bf633f] text-[#fbf9f9] text-sm font-bold leading-normal tracking-[0.015em] @[480px]:text-base @[480px]:font-bold @[480px]:leading-normal @[480px]:tracking-[0.015em]"
                  >
                    <span className="truncate">Get Started</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-10 px-4 py-10 @container">
              <div className="flex flex-col gap-4 items-center text-center">
                <h1 className="text-[#181310] tracking-light text-[32px] font-bold leading-tight @[480px]:text-4xl @[480px]:font-black @[480px]:leading-tight @[480px]:tracking-[-0.033em] max-w-[720px]">
                  Key Features
                </h1>
                <p className="text-[#181310] text-base font-normal leading-normal max-w-[720px]">
                  Skooly offers a range of features tailored to meet the needs of students, teachers, and administrators.
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3 p-0">
                <div className="flex flex-1 gap-3 rounded-lg border border-[#e2d8d4] bg-[#F5F3F0] p-4 flex-col">
                  <div className="text-[#181310]" data-icon="Users" data-size="24px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M117.25,157.92a60,60,0,1,0-66.5,0A95.83,95.83,0,0,0,3.53,195.63a8,8,0,1,0,13.4,8.74,80,80,0,0,1,134.14,0,8,8,0,0,0,13.4-8.74A95.83,95.83,0,0,0,117.25,157.92ZM40,108a44,44,0,1,1,44,44A44.05,44.05,0,0,1,40,108Zm210.14,98.7a8,8,0,0,1-11.07-2.33A79.83,79.83,0,0,0,172,168a8,8,0,0,1,0-16,44,44,0,1,0-16.34-84.87,8,8,0,1,1-5.94-14.85,60,60,0,0,1,55.53,105.64,95.83,95.83,0,0,1,47.22,37.71A8,8,0,0,1,250.14,206.7Z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[#181310] text-base font-bold leading-tight">Student Management</h2>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Manage student records, attendance, and performance with ease. Track progress, communicate with parents, and support student success.
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 gap-3 rounded-lg border border-[#e2d8d4] bg-[#F5F3F0] p-4 flex-col">
                  <div className="text-[#181310]" data-icon="Presentation" data-size="24px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M216,40H136V24a8,8,0,0,0-16,0V40H40A16,16,0,0,0,24,56V176a16,16,0,0,0,16,16H79.36L57.75,219a8,8,0,0,0,12.5,10l29.59-37h56.32l29.59,37a8,8,0,1,0,12.5-10l-21.61-27H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,136H40V56H216V176Z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[#181310] text-base font-bold leading-tight">Teacher Tools</h2>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Empower teachers with tools for lesson planning, grading, and classroom management. Foster collaboration and enhance teaching effectiveness.
                    </p>
                  </div>
                </div>
                <div className="flex flex-1 gap-3 rounded-lg border border-[#e2d8d4] bg-[#F5F3F0] p-4 flex-col">
                  <div className="text-[#181310]" data-icon="Calendar" data-size="24px" data-weight="regular">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88v64a8,8,0,0,1-16,0V132.94l-4.42,2.22a8,8,0,0,1-7.16-14.32l16-8A8,8,0,0,1,112,120Zm59.16,30.45L152,176h16a8,8,0,0,1,0,16H136a8,8,0,0,1-6.4-12.8l28.78-38.37A8,8,0,1,0,145.07,132a8,8,0,1,1-13.85-8A24,24,0,0,1,176,136,23.76,23.76,0,0,1,171.16,150.45Z" />
                    </svg>
                  </div>
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[#181310] text-base font-bold leading-tight">Administrative Efficiency</h2>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Streamline administrative tasks, from scheduling and resource management to reporting and communication. Improve efficiency and reduce workload.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-10 px-4 py-10 @container">
              <div className="flex flex-col gap-4 items-center text-center">
                <h1 className="text-[#181310] tracking-light text-[32px] font-bold leading-tight @[480px]:text-4xl @[480px]:font-black @[480px]:leading-tight @[480px]:tracking-[-0.033em] max-w-[720px]">
                  How Skooly Meets Your Needs
                </h1>
                <p className="text-[#181310] text-base font-normal leading-normal max-w-[720px]">
                  Skooly is designed to address the specific challenges faced by students, teachers, and administrators.
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(158px,1fr))] gap-3">
                <div className="flex flex-col gap-3 pb-3">
                  <div
                    className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-xl"
                    style={{
                      backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuC3EUWJI9g_EHmLc-Hd0dN-k5kzatA8ec5qnAZp--8-Vz31uclwvjS_oDm0C0CYckHJHTtZfRHtMjKvXQdKL5Ns19CyKePZEC4S-Od1fiyksgAlzFnWROFQun8m8qcB5OD0DN1zvtgqmd21ps9-s1KKE6LIrfEdJJtH24mM8AD1nHjJtJWv9uWvMdjMh4zGeJfyc7ppk5BOY0l3W-xeHAzH0tV9oH-gdtOqU3zw2iQGP8aRpvrZHUUd0Kr4r4Ny9E7eAgmz9vs5nnFq")'
                    }}
                  />
                  <div>
                    <p className="text-[#181310] text-base font-medium leading-normal">For Students</p>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Access course materials, track assignments, and communicate with teachers. Stay organized and engaged in your learning journey.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 pb-3">
                  <div
                    className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-xl"
                    style={{
                      backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDGpczY7lt8w6ivE-HCN2iuCnNqoexiNXCnqQ0IPt2nIh6ol5Ptct6igASoeRR-hhrcLJVAYfOf2nk1l1QxkHnbmXMDlSBMTYzyWMW9FFHDcVRxfYRRvjUanKuRsHZnR9-s-4x38nBsoLu2ji_X1q5WUss5-yrxSxj2nBcX_JPLCLocxc_fYYpBskq_D3Zw6ksYmQmdNhcZhk6Ibop5LauL-Ubr7HRE1QcPVJWXZnbLeJOyzaAcdfBq7o8IP2ysnxXCZVu6hlrFZoM-")'
                    }}
                  />
                  <div>
                    <p className="text-[#181310] text-base font-medium leading-normal">For Teachers</p>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Create engaging lessons, assess student progress, and communicate with students and parents. Enhance your teaching experience.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3 pb-3">
                  <div
                    className="w-full bg-center bg-no-repeat aspect-video bg-cover rounded-xl"
                    style={{
                      backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDedOyJMNfAz5DoFlRcmRYWq688diJM2iXCkWJexq1-ypANj1EExgEbjSzr3oDefxAZ3uN2iMepSUKNx0qZv02MGunwQbRxT31gyn81Z3RNKEMIesC1ShCkaz5EWF06QacS_cF_zQ3mKBrwGIdUt3mUKTupdzTM35iIW4UReS3ZEzecsvlE5_EUnFV0WF9j8G5E7egC2MyMXINrxzdho0_CN1cNrIaZcs7kJxX08DeMArv0oaHHsqwMOrhPvICuPIq3ud8P5yC3Kgw2")'
                    }}
                  />
                  <div>
                    <p className="text-[#181310] text-base font-medium leading-normal">For Administrators</p>
                    <p className="text-[#8a695c] text-sm font-normal leading-normal">
                      Manage school operations, track performance metrics, and ensure smooth communication across the school community. Optimize school management.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="@container">
              <div className="flex flex-col justify-end gap-6 px-4 py-10 @[480px]:gap-8 @[480px]:px-10 @[480px]:py-20">
                <div className="flex flex-col gap-2 text-center items-center">
                  <h1 className="text-[#181310] tracking-light text-[32px] font-bold leading-tight @[480px]:text-4xl @[480px]:font-black @[480px]:leading-tight @[480px]:tracking-[-0.033em] max-w-[720px] text-center">
                    Ready to Transform Your School?
                  </h1>
                  <p className="text-[#181310] text-base font-normal leading-normal max-w-[720px] text-center">
                    Join the growing number of schools that are using Skooly to enhance their educational environment.
                  </p>
                </div>
                <div className="flex flex-1 justify-center">
                  <div className="flex flex-col items-center gap-3 w-full max-w-[480px]">
                    <Link
                      href="/sign-up"
                      className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 @[480px]:h-12 @[480px]:px-5 bg-[#bf633f] text-[#fbf9f9] text-sm font-bold leading-normal tracking-[0.015em] @[480px]:text-base @[480px]:font-bold @[480px]:leading-normal @[480px]:tracking-[0.015em] w-full"
                    >
                      <span className="truncate">Get Started</span>
                    </Link>
                    <Link href="/join" className="text-[#8a695c] text-sm hover:underline">
                      Have a join code? Join here
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="flex justify-center">
          <div className="flex max-w-[960px] flex-1 flex-col">
            <footer className="flex flex-col gap-6 px-5 py-10 text-center @container">
              <div className="flex flex-wrap items-center justify-center gap-6 @[480px]:flex-row @[480px]:justify-around">
                <Link href="#" className="text-[#8a695c] text-base font-normal leading-normal min-w-40">Home</Link>
                <Link href="#" className="text-[#8a695c] text-base font-normal leading-normal min-w-40">Features</Link>
                <Link href="#" className="text-[#8a695c] text-base font-normal leading-normal min-w-40">Pricing</Link>
                <Link href="#" className="text-[#8a695c] text-base font-normal leading-normal min-w-40">Contact</Link>
              </div>
              <p className="text-[#8a695c] text-base font-normal leading-normal">© {new Date().getFullYear()} Skooly. All rights reserved.</p>
            </footer>
          </div>
        </footer>
      </div>
    </div>
  );
}