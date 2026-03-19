type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function WorkpackPage({ params }: Props) {
  const { projectId } = await params;

  return (
    <div>

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Workpack</h1>
          <p className="text-slate-500">
            Manage digital site documents for this project
          </p>
        </div>

        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Upload Document
        </button>
      </div>

      {/* STATS */}
      <div className="flex gap-4 mb-6">
        <div className="bg-white border rounded-xl p-4 w-52">
          <p className="text-slate-500 text-sm">Total Documents</p>
          <p className="text-2xl font-bold">0</p>
        </div>

        <div className="bg-white border rounded-xl p-4 w-52">
          <p className="text-slate-500 text-sm">Linked to Towers</p>
          <p className="text-2xl font-bold">0</p>
        </div>

        <div className="bg-white border rounded-xl p-4 w-52">
          <p className="text-slate-500 text-sm">QR Ready</p>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>

      {/* EMPTY STATE */}
      <div className="bg-white border rounded-xl p-14 text-center">
        <h2 className="text-xl font-semibold mb-2">
          No workpack documents uploaded yet
        </h2>

        <p className="text-slate-500 mb-5">
          Upload drawings, lift studies, SWMS, ITPs and checklists.
        </p>

        <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
          Upload First Document
        </button>
      </div>

    </div>
  );
}