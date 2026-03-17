type Props = {
  params: Promise<{ projectId: string }>;
};

export default async function DefectsPage({ params }: Props) {
  const { projectId } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Defects — {projectId}
      </h1>

      <div className="bg-white p-6 rounded-2xl shadow-sm">
        Defects module coming next.
      </div>
    </div>
  );
}