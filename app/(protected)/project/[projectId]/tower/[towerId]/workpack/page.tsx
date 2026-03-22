import Link from "next/link";

export default function WorkpackHome({
  params,
}: {
  params: { projectId: string; towerId: string };
}) {
  const { projectId, towerId } = params;

  return (
    <div className="space-y-6">

      <div className="text-2xl font-semibold">
        Workpack
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Safety Sign-On
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          ITC Checklists
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Permits
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/lift-study`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Lift Studies
        </Link>

        <Link
          href={`/project/${projectId}/tower/${towerId}/workpack/docs`}
          className="border rounded-xl p-6 hover:bg-slate-50"
        >
          Documents
        </Link>

      </div>

    </div>
  );
}