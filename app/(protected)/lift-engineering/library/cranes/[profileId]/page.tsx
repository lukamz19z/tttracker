"use client";

import { useEffect, useState } from "react";
import { CraneProfileDetail } from "./CraneProfileDetail";

export default function CraneProfileDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const [profileId, setProfileId] = useState("");
  useEffect(() => {
    let active = true;
    void params.then(({ profileId: id }) => { if (active) setProfileId(id); });
    return () => { active = false; };
  }, [params]);
  return profileId ? <CraneProfileDetail profileId={profileId}/> : null;
}
