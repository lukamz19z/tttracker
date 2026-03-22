"use client";

import QRCode from "react-qr-code";
import { useParams } from "next/navigation";

export default function QRPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const url = `${window.location.origin}/project/${projectId}/tower/${towerId}/workpack`;

  return (
    <div className="bg-white border rounded-2xl p-6 text-center">
      <div className="text-xl font-semibold mb-4">
        Workpack QR Access
      </div>

      <QRCode value={url} />

      <div className="mt-4 text-slate-600">
        Scan this QR code to open this tower workpack on mobile.
      </div>
    </div>
  );
}