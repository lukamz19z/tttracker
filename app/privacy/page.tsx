import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | TTTracker",
  description:
    "Privacy Policy explaining how TTTracker collects, uses, stores and protects information.",
};

const LAST_UPDATED = "26 July 2026";

// Change these details before publishing if required.
const APP_NAME = "TTTracker";
const OPERATOR_NAME = "BC Contracting Australia";
const CONTACT_EMAIL = "support@tttracker.com.au";
const WEBSITE_URL = "https://tttracker.com.au";

type PolicySectionProps = {
  id: string;
  title: string;
  children: React.ReactNode;
};

function PolicySection({ id, title, children }: PolicySectionProps) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-slate-200 py-8 first:border-t-0 first:pt-0"
    >
      <h2 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
        {title}
      </h2>

      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-600 sm:text-base">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
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
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Return to TTTracker
          </Link>
        </div>
      </header>

      <section className="bg-slate-950">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-400">
            Legal and privacy
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
            Privacy Policy
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            This policy explains how {APP_NAME} collects, uses, stores and
            protects personal and operational information.
          </p>

          <p className="mt-6 text-sm font-semibold text-slate-400">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-14">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            On this page
          </p>

          <nav className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
            <a className="block hover:text-blue-600" href="#overview">
              Overview
            </a>
            <a className="block hover:text-blue-600" href="#information">
              Information collected
            </a>
            <a className="block hover:text-blue-600" href="#use">
              How information is used
            </a>
            <a className="block hover:text-blue-600" href="#sharing">
              Information sharing
            </a>
            <a className="block hover:text-blue-600" href="#storage">
              Storage and security
            </a>
            <a className="block hover:text-blue-600" href="#retention">
              Data retention
            </a>
            <a className="block hover:text-blue-600" href="#rights">
              Your rights
            </a>
            <a className="block hover:text-blue-600" href="#children">
              Children
            </a>
            <a className="block hover:text-blue-600" href="#changes">
              Policy changes
            </a>
            <a className="block hover:text-blue-600" href="#contact">
              Contact us
            </a>
          </nav>
        </aside>

        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <PolicySection id="overview" title="1. Overview">
            <p>
              {APP_NAME} is a construction operations and project-management
              platform operated by {OPERATOR_NAME}. It is intended for
              authorised employees, contractors, supervisors, mechanics,
              administrators and other approved users.
            </p>

            <p>
              By accessing or using {APP_NAME}, you acknowledge that information
              may be handled as described in this Privacy Policy.
            </p>
          </PolicySection>

          <PolicySection
            id="information"
            title="2. Information we may collect"
          >
            <p>
              The information collected depends on your role, permissions and
              how you use the platform.
            </p>

            <h3 className="font-bold text-slate-900">
              Account and profile information
            </h3>

            <ul className="list-disc space-y-2 pl-6">
              <li>Name and email address</li>
              <li>User account identifier</li>
              <li>Job title, role, project and crew assignment</li>
              <li>Profile information voluntarily supplied by the user</li>
              <li>
                Clothing or personal protective equipment sizing where required
                for workplace administration
              </li>
            </ul>

            <h3 className="font-bold text-slate-900">
              Project and operational information
            </h3>

            <ul className="list-disc space-y-2 pl-6">
              <li>Daily docket and work-progress records</li>
              <li>Tower, project, crew and construction-status information</li>
              <li>Materials, bundle, member, bolt and delivery records</li>
              <li>Fleet jobs, defects, comments and close-out records</li>
              <li>Vehicle, plant, equipment and maintenance records</li>
              <li>Vehicle and plant prestart inspection information</li>
              <li>Safety, compliance and risk-assessment records</li>
              <li>Notifications, acknowledgements and activity records</li>
            </ul>

            <h3 className="font-bold text-slate-900">
              Photos, files and attachments
            </h3>

            <p>
              Users may upload photographs, documents, certificates, inspection
              records, supporting evidence and other project-related files.
              Users should only upload information they are authorised to
              provide.
            </p>

            <h3 className="font-bold text-slate-900">
              Device and technical information
            </h3>

            <ul className="list-disc space-y-2 pl-6">
              <li>Device type, operating system and app version</li>
              <li>Login and authentication activity</li>
              <li>IP address and basic network information</li>
              <li>Crash, performance and diagnostic information</li>
              <li>Push-notification token and notification preferences</li>
            </ul>

            <p>
              {APP_NAME} does not intentionally collect precise location data
              unless a future feature clearly requests permission and the user
              or organisation enables that feature.
            </p>
          </PolicySection>

          <PolicySection id="use" title="3. How we use information">
            <p>Information may be used to:</p>

            <ul className="list-disc space-y-2 pl-6">
              <li>Create, authenticate and manage user accounts</li>
              <li>Provide role-based access to projects and features</li>
              <li>Record and manage construction activity</li>
              <li>Track project, tower, delivery and materials progress</li>
              <li>Manage fleet jobs, inspections and maintenance</li>
              <li>Provide safety and compliance functionality</li>
              <li>Send operational alerts and push notifications</li>
              <li>Investigate defects, incidents and technical problems</li>
              <li>Maintain audit trails and workplace records</li>
              <li>Improve the reliability, security and usability of the app</li>
              <li>Meet legal, contractual and regulatory obligations</li>
            </ul>
          </PolicySection>

          <PolicySection id="sharing" title="4. How information may be shared">
            <p>
              Information may be visible to authorised users within the
              relevant organisation or project according to their assigned
              permissions.
            </p>

            <p>
              We may also use service providers that support the operation of
              {` ${APP_NAME}`}, including:
            </p>

            <ul className="list-disc space-y-2 pl-6">
              <li>Cloud hosting and database providers</li>
              <li>File-storage providers</li>
              <li>Authentication providers</li>
              <li>Push-notification services</li>
              <li>Application monitoring and diagnostic providers</li>
              <li>Website hosting and deployment services</li>
            </ul>

            <p>
              These providers may process information only as required to
              deliver their services and subject to their contractual,
              technical and privacy safeguards.
            </p>

            <p>
              We may disclose information where reasonably required by law, a
              court order, a regulator, workplace safety obligations or to
              protect the rights, safety and security of users, the organisation
              or other parties.
            </p>

            <p>
              We do not sell personal information or use personal information
              for third-party advertising.
            </p>
          </PolicySection>

          <PolicySection id="storage" title="5. Data storage and security">
            <p>
              {APP_NAME} uses cloud-based systems to store and process
              information. Depending on the service provider, information may
              be processed or backed up in Australia or other jurisdictions.
            </p>

            <p>
              We use reasonable administrative, technical and organisational
              safeguards designed to protect information, including
              authentication, access controls, database security policies,
              encrypted network communication and role-based permissions.
            </p>

            <p>
              No electronic system is completely secure. Users are responsible
              for protecting their passwords, devices and account access and
              should immediately report suspected unauthorised access.
            </p>
          </PolicySection>

          <PolicySection id="retention" title="6. Data retention">
            <p>
              Information is retained for as long as reasonably necessary to
              operate {APP_NAME}, support active projects, maintain business and
              workplace records, resolve disputes and meet contractual, safety,
              legal and regulatory obligations.
            </p>

            <p>
              Some project, safety, asset, maintenance or employment-related
              records may need to be retained after a user account is disabled
              or a project is completed.
            </p>
          </PolicySection>

          <PolicySection id="rights" title="7. Access, correction and deletion">
            <p>
              Subject to applicable law and organisational record-keeping
              requirements, users may request:
            </p>

            <ul className="list-disc space-y-2 pl-6">
              <li>Access to personal information held about them</li>
              <li>Correction of inaccurate personal information</li>
              <li>Deletion of eligible personal information</li>
              <li>Deactivation of their user account</li>
              <li>Information about how their data is handled</li>
            </ul>

            <p>
              Some information cannot be deleted immediately where it forms part
              of a required project, safety, legal, financial, maintenance or
              audit record.
            </p>

            <p>
              Requests can be submitted using the contact details at the end of
              this policy.
            </p>
          </PolicySection>

          <PolicySection id="children" title="8. Children’s privacy">
            <p>
              {APP_NAME} is a workplace and construction-management platform and
              is not intended for children. We do not knowingly provide accounts
              to or collect personal information directly from children under
              the applicable minimum working or digital-consent age.
            </p>
          </PolicySection>

          <PolicySection id="changes" title="9. Changes to this policy">
            <p>
              This Privacy Policy may be updated from time to time to reflect
              changes to {APP_NAME}, legal requirements or operational
              practices.
            </p>

            <p>
              The latest version will be published on this page with an updated
              effective date. Material changes may also be communicated through
              the app or by email.
            </p>
          </PolicySection>

          <PolicySection id="contact" title="10. Contact us">
            <p>
              For questions, privacy requests or concerns about how information
              is handled, contact:
            </p>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="font-bold text-slate-950">{OPERATOR_NAME}</p>

              <p className="mt-2">
                Email:{" "}
                <a
                  className="font-semibold text-blue-600 hover:underline"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
              </p>

              <p>
                Website:{" "}
                <a
                  className="font-semibold text-blue-600 hover:underline"
                  href={WEBSITE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {WEBSITE_URL}
                </a>
              </p>
            </div>
          </PolicySection>

          <div className="mt-8 rounded-2xl bg-slate-950 p-6 text-white">
            <p className="font-bold">Need privacy assistance?</p>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-bold text-blue-400 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              and include “Privacy Request” in the subject line.
            </p>
          </div>
        </article>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {OPERATOR_NAME}. All rights reserved.
          </p>

          <div className="flex gap-5">
            <Link href="/" className="font-semibold hover:text-blue-600">
              TTTracker
            </Link>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-semibold hover:text-blue-600"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}