"use client";

import { useEffect, useState } from "react";
import { CraneConfigurationDetail } from "../../[resource]/CraneConfigurationDetail";

export default function CraneConfigurationDetailPage({ params }: { params: Promise<{ configurationId: string }> }) {
  const [configurationId, setConfigurationId] = useState("");
  useEffect(() => { let active = true; void params.then(({ configurationId: id }) => { if (active) setConfigurationId(id); }); return () => { active = false; }; }, [params]);
  return configurationId ? <CraneConfigurationDetail configurationId={configurationId}/> : null;
}
