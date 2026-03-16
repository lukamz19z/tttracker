export function Topbar({ title }: { title: string }) {
  return (
    <div className="bg-white border-b px-6 py-4">
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}