"use client";

import { useParams } from "next/navigation";

export default function SafetySignonPage() {
  const params = useParams();
  const towerId = params.towerId as string;

  return (
    <div className="space-y-4">

      <div className="bg-white border rounded-2xl p-6">
        <div className="text-xl font-semibold mb-4">
          Safety Sign-Ons
        </div>

        <div className="text-slate-600">
          This section will allow crew to sign safety documents
          (daily / swing / once).
        </div>

        <div className="mt-4 border rounded-xl p-4 bg-slate-50">
          Feature coming next step:
          <ul className="list-disc ml-6 mt-2">
            <li>Crew list</li>
            <li>Daily reset</li>
            <li>QR sign-on</li>
            <li>Signature capture</li>
          </ul>
        </div>
      </div>

    </div>
  );
}