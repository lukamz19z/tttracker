"use client";

import { login } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  function handleLogin() {
    login();
    router.push("/");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-10 rounded-2xl shadow-sm w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2">TTTracker</h1>
        <p className="text-slate-600 mb-6">
          Sign in to access your projects
        </p>

        <button
          onClick={handleLogin}
          className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-medium"
        >
          Login
        </button>
      </div>
    </main>
  );
}