"use client";

import { FormEvent, useState } from "react";
import { Mail, Send } from "lucide-react";

type SupportContactFormProps = {
  supportEmail: string;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  issueType: string;
  project: string;
  device: string;
  message: string;
};

const initialForm: FormState = {
  name: "",
  email: "",
  phone: "",
  issueType: "",
  project: "",
  device: "",
  message: "",
};

export default function SupportContactForm({
  supportEmail,
}: SupportContactFormProps) {
  const [form, setForm] = useState<FormState>(initialForm);

  function updateField<K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const subject = `TTTracker Support Request${
      form.issueType ? ` - ${form.issueType}` : ""
    }`;

    const body = [
      "TTTracker Support Request",
      "",
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      `Phone: ${form.phone || "Not provided"}`,
      `Issue type: ${form.issueType || "Not selected"}`,
      `Project: ${form.project || "Not provided"}`,
      `Device: ${form.device || "Not provided"}`,
      "",
      "Issue details:",
      form.message,
    ].join("\n");

    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = mailtoUrl;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Mail size={22} />
        </div>

        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
            Support request
          </p>

          <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
            Send us a message
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Complete the form below and your email application will open with
            the request prepared.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-800">Name *</span>
          <input
            required
            type="text"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Your full name"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Email *</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="you@example.com"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Phone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="Optional"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Issue type *</span>
          <select
            required
            value={form.issueType}
            onChange={(event) => updateField("issueType", event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          >
            <option value="">Select an issue</option>
            <option value="Login or account access">
              Login or account access
            </option>
            <option value="Project access">Project access</option>
            <option value="Fleet jobs">Fleet jobs</option>
            <option value="Prestarts">Prestarts</option>
            <option value="Daily dockets">Daily dockets</option>
            <option value="Materials or deliveries">
              Materials or deliveries
            </option>
            <option value="Notifications">Notifications</option>
            <option value="App error or crash">App error or crash</option>
            <option value="Other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Project</span>
          <input
            type="text"
            value={form.project}
            onChange={(event) => updateField("project", event.target.value)}
            placeholder="Project name or number"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-800">Device</span>
          <input
            type="text"
            value={form.device}
            onChange={(event) => updateField("device", event.target.value)}
            placeholder="e.g. iPhone 17 or Samsung S23"
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-bold text-slate-800">
          Describe the issue *
        </span>
        <textarea
          required
          rows={7}
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          placeholder="Explain what you were doing, what happened and any error message you received."
          className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
      </label>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Clicking the button will open your device’s default email application.
        You will still need to press <strong>Send</strong> from the email app.
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 sm:w-auto"
      >
        <Send size={17} />
        Prepare support email
      </button>
    </form>
  );
}