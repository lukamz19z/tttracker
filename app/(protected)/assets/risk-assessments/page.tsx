import Link from "next/link";
import {
  ClipboardList,
  FileText,
  Library,
  Plus,
  Settings2,
} from "lucide-react";
import { PageHeader, PageShell } from "../components";

export default function RiskAssessmentsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Assets"
        title="Risk Assessments"
        description="Create reusable risk assessment templates and generate controlled assessment reports for vehicles, trailers, cranes, telehandlers and other plant."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/assets/risk-assessments/templates"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Settings2 size={16} />
              Manage Templates
            </Link>

            <Link
              href="/assets/risk-assessments/library"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Library size={16} />
              Risk Library
            </Link>

            <Link
              href="/assets/risk-assessments/new"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus size={16} />
              New Assessment
            </Link>
          </div>
        }
      />

      <div className="space-y-6 px-4 pb-10 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-slate-900 p-3 text-white">
              <ClipboardList size={22} />
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-950">
                Risk Assessment Register
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Completed and draft risk assessments will appear here once
                the assessment creation page is connected.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <FileText className="mx-auto text-slate-400" size={32} />

            <h3 className="mt-4 text-lg font-black text-slate-900">
              No risk assessments yet
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              Create and publish a template first, then generate an
              assessment against an existing asset.
            </p>

            <Link
              href="/assets/risk-assessments/templates"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              <Settings2 size={16} />
              Open Template Builder
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}