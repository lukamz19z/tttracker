"use client";

import { useParams } from "next/navigation";
import DailyDocketForm from "@/components/dockets/DailyDocketForm";

export default function NewDailyDocketPage() {
  const params = useParams();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  return (
    <DailyDocketForm
      mode="create"
      projectId={projectId}
      towerId={towerId}
    />
  );
}