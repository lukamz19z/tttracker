import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  ExternalLink,
  HelpCircle,
  LockKeyhole,
  Mail,
  Smartphone,
  UserRound,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Support | TTTracker",
  description:
    "Get help with TTTracker accounts, access, notifications and technical issues.",
};

const SUPPORT_EMAIL = "lmzetovic@gmail.com";
const WEBSITE_URL = "https://tttracker.com.au";

const supportItems = [
  {
    icon: UserRound,
    title: "Account and login support",
    description:
      "Get help signing in, resetting access or confirming your assigned project and permissions.",
  },
  {
    icon: LockKeyhole,
    title: "Access and permissions",
    description:
      "Contact support if a page, project, fleet record or feature is unavailable for your account.",
  },
  {
    icon: Bell,
    title: "Notifications",
    description:
      "Get assistance with notification preferences, missing alerts or push-notification delivery.",
  },
  {
    icon: Smartphone,
    title: "App issues",
    description:
      "Report crashes, loading problems, display issues or features that are not working correctly.",
  },
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
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
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">
            TTTracker support
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Help when you need it.
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Get assistance with account access, projects, notifications,
            mobile-app issues and TTTracker features.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-5 md:grid-cols-2">
          {supportItems.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Icon size={22} />
              </div>

              <h2 className="mt-5 text-xl font-black tracking-tight">{title}</h2>

              <p className="mt-3 text-sm leading-7 text-slate-600">
                {description}
              </p>
            </article>
          ))}
        </div>

        <section className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Mail size={22} />
            </div>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">
                Contact support
              </p>

              <h2 className="mt-2 text-2xl font-black tracking-tight">
                Email the TTTracker team
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">
                Include your name, device type, project, the page affected and a
                screenshot where possible.
              </p>

              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=TTTracker Support Request`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
              >
                <Mail size={17} />
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <HelpCircle className="text-blue-600" size={24} />
            <h2 className="text-2xl font-black tracking-tight">
              Before contacting support
            </h2>
          </div>

          <ol className="mt-6 space-y-4 text-sm leading-7 text-slate-600">
            <li>
              <strong className="text-slate-950">1.</strong> Confirm your device
              has an active internet connection.
            </li>
            <li>
              <strong className="text-slate-950">2.</strong> Close and reopen
              TTTracker.
            </li>
            <li>
              <strong className="text-slate-950">3.</strong> Confirm you are
              using the latest version available through the App Store or Google
              Play.
            </li>
            <li>
              <strong className="text-slate-950">4.</strong> Sign out and sign
              back in where possible.
            </li>
          </ol>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/privacy"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Privacy Policy
            <ExternalLink size={15} />
          </Link>

          <a
            href={WEBSITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            TTTracker website
            <ExternalLink size={15} />
          </a>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-8 text-sm text-slate-500 sm:px-8">
          © {new Date().getFullYear()} BC Contracting Australia. All rights
          reserved.
        </div>
      </footer>
    </main>
  );
}