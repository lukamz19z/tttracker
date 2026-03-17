import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

const fakeProjects = [
  { id: "p1", name: "Inland Rail – Section A" },
  { id: "p2", name: "Sydney Metro – Package 4" },
  { id: "p3", name: "Snowy Transmission Line" },
];

export default function ProjectsHome() {
  return (
    <AppShell title="Projects">
      <div className="grid md:grid-cols-3 gap-4">
        {fakeProjects.map((project) => (
          <Link
            key={project.id}
            href={`/project/${project.id}`}
            className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md"
          >
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <p className="text-slate-500 mt-2">Open dashboard</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}