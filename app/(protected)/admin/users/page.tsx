"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function AdminUsersPage() {
  const supabase = createSupabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function createUser(e: any) {
  e.preventDefault();
  setLoading(true);
  setMsg("");

  const res = await fetch("/api/admin/create-user", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });

  const result = await res.json();

  if (!res.ok) {
    setMsg(result.error);
    setLoading(false);
    return;
  }

  setMsg("User created successfully");
  setEmail("");
  setPassword("");
  setRole("viewer");
  setLoading(false);
}}