"use client";

import { useParams } from "next/navigation";
import DailyDocketForm from "@/components/dockets/DailyDocketForm";

export default function ViewDocketPage() {
  const params = useParams();

  return (
    <DailyDocketForm
      mode="view"
      projectId={params.projectId as string}
      towerId={params.towerId as string}
      docketId={params.docketId as string}
    />
  );
}