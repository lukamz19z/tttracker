"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";

export default function TowersPage({
  params,
}: {
  params: { projectId: string };
}) {
  const projectId = params.projectId;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Starting...");

  useEffect(() => {
    testLoad();
  }, []);

  async function testLoad() {
    try {
      console.log("STEP 1 — component mounted");
      setMessage("Component mounted");

      const supabase = createSupabaseBrowser();

      console.log("STEP 2 — supabase client created");
      setMessage("Supabase client created");

      console.log("PROJECT ID:", projectId);
      setMessage("Project ID: " + projectId);

      const { data, error } = await supabase
        .from("towers")
        .select("*");

      console.log("STEP 3 — query finished");
      console.log("DATA:", data);
      console.log("ERROR:", error);

      setMessage("Query finished. Check console.");
      setLoading(false);

    } catch (err) {
      console.error("CRASH:", err);
      setMessage("Crash happened — check console");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold">Debug Towers</h1>
        <p className="mt-4">{message}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Finished Debug</h1>
      <p>{message}</p>

      <Link
        href={`/project/${projectId}/towers/import`}
        className="text-blue-600 underline"
      >
        Go Import
      </Link>
    </div>
  );
}