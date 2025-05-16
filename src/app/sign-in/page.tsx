"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const LoginPage = () => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
    <div className="h-screen flex items-center justify-center bg-lamaSkyLight">
      <div className="bg-white p-12 rounded-md shadow-2xl flex flex-col gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Image src="/logo.png" alt="" width={24} height={24} />
          Skooly
        </h1>
        <h2 className="text-gray-400">Sign in to your account</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">Email or Username</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="p-2 rounded-md ring-1 ring-gray-300"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="p-2 rounded-md ring-1 ring-gray-300"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white my-1 rounded-md text-sm p-[10px]"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
