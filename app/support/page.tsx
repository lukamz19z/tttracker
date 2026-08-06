import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import SupportContactForm from "./SupportContactForm";

export const metadata: Metadata = {
  title: "Support | TTTracker",
  description:
    "Contact TTTracker support for help with accounts, projects, access and technical issues.",
};

const SUPPORT_EMAIL = "lmzetovic@gmail.com";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="text-xl font-black tracking-tight text-slate-950"
          >
            <span className="text-blue-600">TT</span>Tracker
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Return to TTTracker
          </Link>
        </div>
      </header>

      <section className="bg-slate-950">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">
            TTTracker support
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            How can we help?
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Send us details about your account, access issue, project or
            technical problem and we will help you resolve it.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <SupportContactForm supportEmail={SUPPORT_EMAIL} />

          <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <Mail size={22} />
            </div>

            <h2 className="mt-5 text-xl font-black tracking-tight">
              Contact support
            </h2>

            <p className="mt-3 text-sm leading-7 text-slate-600">
              Include your name, device type, project and a clear description of
              what happened.
            </p>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-5 block break-all text-sm font-bold text-blue-600 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Helpful information
              </p>

              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>• Your phone model</li>
                <li>• iOS or Android version</li>
                <li>• The affected TTTracker page</li>
                <li>• Any error message shown</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} BC Contracting Australia. All rights
            reserved.
          </p>

          <Link
            href="/privacy"
            className="font-semibold text-slate-600 hover:text-blue-600"
          >
            Privacy Policy
          </Link>
        </div>
      </footer>
    </main>
  );
}