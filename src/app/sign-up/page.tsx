"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

// export default function SignUpPage() { // Old Clerk component
//   return (
//     <div className=\"min-h-screen flex items-center justify-center bg-gray-100\">
//       <SignUp 
//         path=\"/sign-up\" // Specify the path for the component
//         signInUrl=\"/sign-in\" // Redirect to custom sign-in page if needed
//       />
//     </div>
//   );
// }

const SignUpPage = () => {
  const [username, setUsername] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, schoolName, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sign up. Please try again.");
      }

      setSuccessMessage("Account created successfully! Redirecting to sign-in...");
      setTimeout(() => {
        router.push("/sign-in");
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-[#F5F3F0] group/design-root overflow-x-hidden" style={{ fontFamily: 'Inter, \"Noto Sans\", sans-serif' }}>
      <div className="layout-container flex h-full grow flex-col">
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-b-[#f1ecea] px-10 py-3">
          <div className="flex items-center gap-4 text-[#181310]">
            <Link href="/" className="flex items-center gap-4 text-[#181310]">
              <div className="size-4 flex items-center justify-center">
                <Image src="/logo.png" alt="Skooly Logo" width={24} height={24} />
              </div>
              <h2 className="text-[#181310] text-lg font-bold leading-tight tracking-[-0.015em]">Skooly</h2>
            </Link>
          </div>
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
            <h2 className="text-[#181310] tracking-light text-[28px] font-bold leading-tight px-4 text-center pb-3 pt-5">Get started with Skooly</h2>
            {error && <p className="text-sm text-red-500 bg-red-100 p-3 rounded-md mb-2">{error}</p>}
            {successMessage && <p className="text-sm text-green-600 bg-green-100 p-3 rounded-md mb-2">{successMessage}</p>}
            <form onSubmit={handleSubmit} className="flex flex-col gap-0">
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <input
                    placeholder="Username"
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <input
                    placeholder="School Name"
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1">
                  <input
                    placeholder="Email"
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1 relative">
                  <input
                    placeholder="Password"
                    type={showPassword ? "text" : "password"}
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal pr-12"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-7 transform -translate-y-1/2 text-[#8a695c] focus:outline-none"
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
              <div className="flex max-w-[480px] flex-wrap items-end gap-4 px-4 py-3">
                <label className="flex flex-col min-w-40 flex-1 relative">
                  <input
                    placeholder="Confirm Password"
                    type={showConfirmPassword ? "text" : "password"}
                    className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-xl text-[#181310] focus:outline-0 focus:ring-0 border-none bg-[#f1ecea] focus:border-none h-14 placeholder:text-[#8a695c] p-4 text-base font-normal leading-normal pr-12"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-4 top-7 transform -translate-y-1/2 text-[#8a695c] focus:outline-none"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
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
              <div className="flex px-4 py-3">
                <button
                  type="submit"
                  disabled={!!successMessage}
                  className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-5 flex-1 bg-[#bf633f] text-[#fbf9f9] text-base font-bold leading-normal tracking-[0.015em]"
                >
                  <span className="truncate">Sign Up</span>
                </button>
              </div>
            </form>
            <p className="text-[#8a695c] text-sm font-normal leading-normal pb-3 pt-1 px-4 text-center underline cursor-pointer">
              Already have an account? <Link href="/sign-in" className="font-bold">Log in</Link>
            </p>
            <p className="text-[#8a695c] text-sm font-normal leading-normal pb-3 px-4 text-center">
              Are you a parent or teacher? <Link href="/join" className="text-[#bf633f] font-bold hover:underline">Use a join code</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage; 