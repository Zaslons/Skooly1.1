"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LoginPage = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();
      console.log("Sign-in response data:", data);
      
      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to sign in"); 
      }
      
      if (!data.user) {
        throw new Error("Sign-in successful, but user data is missing in the response.");
      }
      console.log("User data:", data.user);

      const { role, schoolId, profileId } = data.user;
      console.log(`Attempting to redirect. Role: ${role}, SchoolId: ${schoolId}, ProfileId: ${profileId}`);

      let targetUrl = "";

      if (role === 'system_admin') {
        targetUrl = '/system/plans';
      } else if (schoolId) {
        switch (role) {
          case 'admin':
            targetUrl = `/schools/${schoolId}/admin`;
            break;
          case 'teacher':
            targetUrl = profileId 
              ? `/schools/${schoolId}/list/teachers/${profileId}` 
              : `/schools/${schoolId}/teacher`;
            break;
          case 'student':
            targetUrl = profileId 
              ? `/schools/${schoolId}/list/students/${profileId}` 
              : `/schools/${schoolId}/student`;
            break;
          case 'parent':
            targetUrl = `/schools/${schoolId}/parent`;
            break;
          default:
            targetUrl = `/schools/${schoolId}`;
            break;
        }
      } else {
        targetUrl = "/create-school";
      }
      
      console.log(`Redirecting to: ${targetUrl} using router.push()`);
      router.push(targetUrl);

    } catch (err: any) {
      console.error("Sign-in handleSubmit error:", err);
      setError(err.message);
    }
  };

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
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Home</Link>
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Features</Link>
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Pricing</Link>
              <Link className="text-[#181310] text-sm font-medium leading-normal" href="#">Contact</Link>
            </div>
            <Link
              href="/sign-up"
              className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-[#bf633f] text-[#fbf9f9] text-sm font-bold leading-normal tracking-[0.015em]"
            >
              <span className="truncate">Sign Up</span>
            </Link>
          </div>
        </header>
        <div className="px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col w-[512px] max-w-[512px] py-5 max-w-[960px] flex-1">
            <h2 className="text-[#181310] tracking-light text-[28px] font-bold leading-tight px-4 text-center pb-3 pt-5">Welcome Back</h2>
            {error && <p className="text-sm text-red-400 px-4 text-center">{error}</p>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-0">
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <p className="text-[#181310] text-base font-medium leading-normal pb-2">Email or Username</p>
                  <input
                    type="text"
                    placeholder="Enter your email or username"
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1 relative">
                  <p className="text-[#181310] text-base font-medium leading-normal pb-2">Password</p>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal pr-12"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-10 transform -translate-y-1/2 text-[#8a695c] focus:outline-none"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12.001C3.226 15.885 7.244 19.5 12 19.5c1.772 0 3.45-.37 4.958-1.03M6.228 6.228A9.956 9.956 0 0112 4.5c4.756 0 8.774 3.615 10.066 7.499a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l12.544 12.544" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.066-.501C19.774 7.615 15.756 4 12 4c-1.772 0-3.45.37-4.958 1.03M3.934 8.226A10.477 10.477 0 001.934 12c1.292 3.885 5.31 7.5 10.066 7.5 2.042 0 3.97-.5 5.606-1.374" />
                      </svg>
                    )}
                  </button>
                </label>
              </div>
              <div className="flex items-center gap-4 bg-[#F5F3F0] px-4 min-h-14 justify-between">
                <p className="text-[#181310] text-base font-normal leading-normal flex-1 truncate">Remember Me</p>
                <div className="shrink-0">
                  <div className="flex size-7 items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-[#e2d8d4] border-2 bg-transparent text-[#bf633f] checked:bg-[#bf633f] checked:border-[#bf633f] focus:ring-0 focus:ring-offset-0 focus:border-[#e2d8d4] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div className="flex px-4 py-3">
                <button
                  type="submit"
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-5 flex-1 bg-[#bf633f] text-[#fbf9f9] text-base font-bold leading-normal tracking-[0.015em]"
                >
                  <span className="truncate">Sign In</span>
                </button>
              </div>
            </form>
            <p className="text-[#8a695c] text-sm font-normal leading-normal pb-3 pt-1 px-4 text-center underline cursor-pointer">
              Forgot Password?
            </p>
            <p className="text-[#8a695c] text-sm font-normal leading-normal pb-3 px-4 text-center">
              Have a join code? <Link href="/join" className="text-[#bf633f] font-bold hover:underline">Join here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
