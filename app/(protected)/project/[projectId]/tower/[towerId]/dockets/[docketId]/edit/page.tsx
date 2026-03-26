"use client";

import { useParams } from "next/navigation";
import DailyDocketForm from "@/components/dockets/DailyDocketForm";

export default function EditDocketPage() {
  const params = useParams();

  return (
    <DailyDocketForm
      mode="edit"
      projectId={params.projectId as string}
      towerId={params.towerId as string}
      docketId={params.docketId as string}
    />
  );
}