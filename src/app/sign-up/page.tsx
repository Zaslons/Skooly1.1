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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("Sign-up form submitted"); // Log to confirm function call
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
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to sign up. Please try again.");
      }

      setSuccessMessage("Account created successfully! Redirecting to sign-in...");
      setTimeout(() => {
        router.push("/sign-in");
      }, 2000); // Redirect after 2 seconds

    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-lamaSkyLight">
      <div className="bg-white p-10 rounded-md shadow-2xl flex flex-col gap-3 w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Image src="/logo.png" alt="Skooly Logo" width={32} height={32} />
          <h1 className="text-2xl font-bold text-gray-700">Create Your Skooly Account</h1>
        </div>
        
        {error && <p className="text-sm text-red-500 bg-red-100 p-3 rounded-md">{error}</p>}
        {successMessage && <p className="text-sm text-green-600 bg-green-100 p-3 rounded-md">{successMessage}</p>}
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600 font-medium">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600 font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Minimum 8 characters"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600 font-medium">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="p-3 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Re-enter your password"
            />
          </div>
          <button
            type="submit"
            disabled={!!successMessage} // Disable button after success
            className="bg-blue-500 text-white py-3 rounded-md text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            Create Account
          </button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-4">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-blue-500 hover:underline font-medium">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default SignUpPage; 