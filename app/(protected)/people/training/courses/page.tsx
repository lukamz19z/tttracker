"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileUp,
  GraduationCap,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  default_expiry_months: number | null;
  does_not_expire: boolean | null;
  active: boolean | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type Course = {
  id: string;
  training_type_id: string;
  project_id: string | null;
  title: string;
  provider: string | null;
  trainer_name: string | null;
  venue: string | null;
  delivery_mode: "face_to_face" | "online" | "blended" | "onsite";
  start_at: string;
  end_at: string;
  timezone: string;
  max_attendees: number | null;
  booking_reference: string | null;
  cost_per_person: number | null;
  total_cost: number | null;
  status:
    | "draft"
    | "booked"
    | "confirmed"
    | "in_progress"
    | "completed"
    | "cancelled";
  joining_instructions: string | null;
  notes: string | null;
  reminder_7_days: boolean;
  reminder_2_days: boolean;
  reminder_day_of: boolean;
  reminder_certificates_3_days: boolean;
  reminder_certificates_7_days: boolean;
  completed_at: string | null;
  created_at: string;
};

type Attendee = {
  id: string;
  course_id: string;
  employee_id: string;
  allocation_status: "allocated" | "invited" | "confirmed" | "cancelled";
  attendance_status:
    | "pending"
    | "attended"
    | "did_not_attend"
    | "part_attended"
    | "cancelled";
  result_status: "pending" | "passed" | "failed" | "not_assessed" | "cancelled";
  allocation_reason: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  does_not_expire: boolean;
  certificate_sharepoint_url: string | null;
  certificate_file_name: string | null;
  employee_training_record_id: string | null;
  notes: string | null;
  completion_processed_at: string | null;
};

type CourseForm = {
  title: string;
  training_type_id: string;
  project_id: string;
  provider: string;
  trainer_name: string;
  venue: string;
  delivery_mode: Course["delivery_mode"];
  start_at: string;
  end_at: string;
  max_attendees: string;
  booking_reference: string;
  cost_per_person: string;
  total_cost: string;
  status: Course["status"];
  joining_instructions: string;
  notes: string;
  reminder_7_days: boolean;
  reminder_2_days: boolean;
  reminder_day_of: boolean;
  reminder_certificates_3_days: boolean;
  reminder_certificates_7_days: boolean;
};

const emptyForm: CourseForm = {
  title: "",
  training_type_id: "",
  project_id: "",
  provider: "",
  trainer_name: "",
  venue: "",
  delivery_mode: "face_to_face",
  start_at: "",
  end_at: "",
  max_attendees: "",
  booking_reference: "",
  cost_per_person: "",
  total_cost: "",
  status: "draft",
  joining_instructions: "",
  notes: "",
  reminder_7_days: true,
  reminder_2_days: true,
  reminder_day_of: true,
  reminder_certificates_3_days: true,
  reminder_certificates_7_days: true,
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addMonths(dateString: string, months: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function courseStatusClasses(status: Course["status"]) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "cancelled") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "confirmed") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "in_progress") return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === "booked") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function TrainingCoursesPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [courses, setCourses] = useState<Course[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const [courseRes, typeRes, employeeRes, projectRes, attendeeRes] =
      await Promise.all([
        supabase
          .from("training_courses")
          .select("*")
          .order("start_at", { ascending: true }),
        supabase
          .from("training_types")
          .select("id, name, category, default_expiry_months, does_not_expire, active")
          .eq("active", true)
          .order("category")
          .order("name"),
        supabase
          .from("employees")
          .select("id, full_name, role, crew_id, active")
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("projects")
          .select("id, name, project_number, status")
          .order("name"),
        supabase
          .from("training_course_attendees")
          .select("*"),
      ]);

    const error =
      courseRes.error ||
      typeRes.error ||
      employeeRes.error ||
      projectRes.error ||
      attendeeRes.error;

    if (error) throw new Error(error.message);

    setCourses((courseRes.data ?? []) as Course[]);
    setTrainingTypes((typeRes.data ?? []) as TrainingType[]);
    setEmployees((employeeRes.data ?? []) as Employee[]);
    setProjects((projectRes.data ?? []) as Project[]);
    setAttendees((attendeeRes.data ?? []) as Attendee[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "Unable to load courses.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const typeById = useMemo(
    () => new Map(trainingTypes.map((item) => [item.id, item])),
    [trainingTypes],
  );

  const employeeById = useMemo(
    () => new Map(employees.map((item) => [item.id, item])),
    [employees],
  );

  const projectById = useMemo(
    () => new Map(projects.map((item) => [item.id, item])),
    [projects],
  );

  const attendeesByCourse = useMemo(() => {
    const map = new Map<string, Attendee[]>();
    attendees.forEach((attendee) => {
      const list = map.get(attendee.course_id) ?? [];
      list.push(attendee);
      map.set(attendee.course_id, list);
    });
    return map;
  }, [attendees]);

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? null;

  const selectedCourseAttendees = selectedCourse
    ? attendeesByCourse.get(selectedCourse.id) ?? []
    : [];

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();

    return courses.filter((course) => {
      if (statusFilter !== "all" && course.status !== statusFilter) return false;

      if (!q) return true;

      const type = typeById.get(course.training_type_id);
      const project = course.project_id ? projectById.get(course.project_id) : null;

      return [
        course.title,
        course.provider,
        course.venue,
        course.trainer_name,
        course.booking_reference,
        type?.name,
        project?.name,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [courses, projectById, search, statusFilter, typeById]);

  const upcomingCount = courses.filter(
    (course) =>
      ["booked", "confirmed"].includes(course.status) &&
      new Date(course.start_at).getTime() >= Date.now(),
  ).length;

  const awaitingAttendanceCount = courses.filter((course) => {
    if (!["in_progress", "completed"].includes(course.status)) return false;
    const list = attendeesByCourse.get(course.id) ?? [];
    return list.some((attendee) => attendee.attendance_status === "pending");
  }).length;

  const awaitingCertificatesCount = courses.filter((course) => {
    if (course.status !== "completed") return false;
    const list = attendeesByCourse.get(course.id) ?? [];
    return list.some(
      (attendee) =>
        attendee.result_status === "passed" &&
        !attendee.employee_training_record_id,
    );
  }).length;

  function openNewCourse() {
    setEditingCourseId(null);
    setForm(emptyForm);
    setCourseModalOpen(true);
  }

  function openEditCourse(course: Course) {
    setEditingCourseId(course.id);
    setForm({
      title: course.title,
      training_type_id: course.training_type_id,
      project_id: course.project_id ?? "",
      provider: course.provider ?? "",
      trainer_name: course.trainer_name ?? "",
      venue: course.venue ?? "",
      delivery_mode: course.delivery_mode,
      start_at: toLocalInput(course.start_at),
      end_at: toLocalInput(course.end_at),
      max_attendees: course.max_attendees ? String(course.max_attendees) : "",
      booking_reference: course.booking_reference ?? "",
      cost_per_person:
        course.cost_per_person !== null ? String(course.cost_per_person) : "",
      total_cost: course.total_cost !== null ? String(course.total_cost) : "",
      status: course.status,
      joining_instructions: course.joining_instructions ?? "",
      notes: course.notes ?? "",
      reminder_7_days: course.reminder_7_days,
      reminder_2_days: course.reminder_2_days,
      reminder_day_of: course.reminder_day_of,
      reminder_certificates_3_days: course.reminder_certificates_3_days,
      reminder_certificates_7_days: course.reminder_certificates_7_days,
    });
    setCourseModalOpen(true);
  }

  async function saveCourse() {
    if (!form.title.trim()) {
      setMessage({ tone: "error", text: "Enter a course title." });
      return;
    }
    if (!form.training_type_id) {
      setMessage({ tone: "error", text: "Select a training type." });
      return;
    }
    if (!form.start_at || !form.end_at) {
      setMessage({ tone: "error", text: "Enter the course start and end time." });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const payload = {
        title: form.title.trim(),
        training_type_id: form.training_type_id,
        project_id: form.project_id || null,
        provider: form.provider.trim() || null,
        trainer_name: form.trainer_name.trim() || null,
        venue: form.venue.trim() || null,
        delivery_mode: form.delivery_mode,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        timezone: "Australia/Sydney",
        max_attendees: form.max_attendees ? Number(form.max_attendees) : null,
        booking_reference: form.booking_reference.trim() || null,
        cost_per_person: form.cost_per_person
          ? Number(form.cost_per_person)
          : null,
        total_cost: form.total_cost ? Number(form.total_cost) : null,
        status: form.status,
        joining_instructions: form.joining_instructions.trim() || null,
        notes: form.notes.trim() || null,
        reminder_7_days: form.reminder_7_days,
        reminder_2_days: form.reminder_2_days,
        reminder_day_of: form.reminder_day_of,
        reminder_certificates_3_days: form.reminder_certificates_3_days,
        reminder_certificates_7_days: form.reminder_certificates_7_days,
      };

      const result = editingCourseId
        ? await supabase.from("training_courses").update(payload).eq("id", editingCourseId)
        : await supabase.from("training_courses").insert(payload);

      if (result.error) throw result.error;

      await loadData();
      setCourseModalOpen(false);
      setMessage({
        tone: "success",
        text: editingCourseId ? "Course updated." : "Course created.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to save course.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCourse(course: Course) {
    const confirmed = window.confirm(
      `Delete "${course.title}"? This also removes its allocations and reminders.`,
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("training_courses")
      .delete()
      .eq("id", course.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    if (selectedCourseId === course.id) setSelectedCourseId(null);
    await loadData();
    setMessage({ tone: "success", text: "Course deleted." });
  }

  function openAllocation(course: Course) {
    setSelectedCourseId(course.id);
    setSelectedEmployeeIds([]);
    setEmployeeSearch("");
    setAllocationModalOpen(true);
  }

  async function allocateEmployees() {
    if (!selectedCourse || selectedEmployeeIds.length === 0) return;

    const existingIds = new Set(
      selectedCourseAttendees.map((attendee) => attendee.employee_id),
    );
    const payload = selectedEmployeeIds
      .filter((employeeId) => !existingIds.has(employeeId))
      .map((employeeId) => ({
        course_id: selectedCourse.id,
        employee_id: employeeId,
        allocation_status: "allocated",
        attendance_status: "pending",
        result_status: "pending",
      }));

    if (payload.length === 0) {
      setAllocationModalOpen(false);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("training_course_attendees")
      .insert(payload);
    setSaving(false);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
    setAllocationModalOpen(false);
    setMessage({
      tone: "success",
      text: `${payload.length} employee${payload.length === 1 ? "" : "s"} allocated.`,
    });
  }

  async function removeAttendee(attendee: Attendee) {
    const { error } = await supabase
      .from("training_course_attendees")
      .delete()
      .eq("id", attendee.id);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function updateAttendee(
    attendeeId: string,
    patch: Partial<Attendee>,
  ) {
    const { error } = await supabase
      .from("training_course_attendees")
      .update(patch)
      .eq("id", attendeeId);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    setAttendees((current) =>
      current.map((attendee) =>
        attendee.id === attendeeId ? { ...attendee, ...patch } : attendee,
      ),
    );
  }

  async function markAllAttended() {
    if (!selectedCourse) return;
    const ids = selectedCourseAttendees.map((attendee) => attendee.id);
    if (!ids.length) return;

    const { error } = await supabase
      .from("training_course_attendees")
      .update({ attendance_status: "attended" })
      .in("id", ids);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function markAllPassed() {
    if (!selectedCourse) return;
    const ids = selectedCourseAttendees
      .filter((attendee) => attendee.attendance_status === "attended")
      .map((attendee) => attendee.id);

    if (!ids.length) return;

    const { error } = await supabase
      .from("training_course_attendees")
      .update({ result_status: "passed" })
      .in("id", ids);

    if (error) {
      setMessage({ tone: "error", text: error.message });
      return;
    }

    await loadData();
  }

  async function processCompletion() {
    if (!selectedCourse) return;

    const type = typeById.get(selectedCourse.training_type_id);
    if (!type) return;

    const eligible = selectedCourseAttendees.filter(
      (attendee) =>
        attendee.attendance_status === "attended" &&
        attendee.result_status === "passed" &&
        !attendee.employee_training_record_id,
    );

    if (!eligible.length) {
      setMessage({
        tone: "error",
        text: "No passed attendees are ready to create training records.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      for (const attendee of eligible) {
        const issueDate =
          attendee.issue_date ?? selectedCourse.end_at.slice(0, 10);

        const expiryDate = attendee.does_not_expire
          ? null
          : attendee.expiry_date ??
            (type.default_expiry_months
              ? addMonths(issueDate, type.default_expiry_months)
              : null);

        const { data: inserted, error: recordError } = await supabase
          .from("employee_training_records")
          .insert({
            employee_id: attendee.employee_id,
            training_type_id: type.id,
            training_name: type.name,
            category: type.category,
            certificate_number: attendee.certificate_number,
            issue_date: issueDate,
            expiry_date: expiryDate,
            does_not_expire: attendee.does_not_expire || type.does_not_expire === true,
            record_status: "current",
          })
          .select("id")
          .single();

        if (recordError) throw recordError;

        const { error: attendeeError } = await supabase
          .from("training_course_attendees")
          .update({
            issue_date: issueDate,
            expiry_date: expiryDate,
            employee_training_record_id: inserted.id,
            completion_processed_at: new Date().toISOString(),
          })
          .eq("id", attendee.id);

        if (attendeeError) throw attendeeError;

        if (attendee.certificate_sharepoint_url) {
          const { error: documentError } = await supabase
            .from("employee_training_documents")
            .insert({
              employee_training_record_id: inserted.id,
              file_name:
                attendee.certificate_file_name ??
                `${employeeById.get(attendee.employee_id)?.full_name ?? "Certificate"}.pdf`,
              sharepoint_web_url: attendee.certificate_sharepoint_url,
            });

          if (documentError) throw documentError;
        }
      }

      await supabase
        .from("training_courses")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", selectedCourse.id);

      await loadData();
      setCompletionModalOpen(false);
      setMessage({
        tone: "success",
        text: `${eligible.length} training record${eligible.length === 1 ? "" : "s"} created.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to process course completion.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);
    try {
      await loadData();
      setMessage({ tone: "success", text: "Courses refreshed." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to refresh.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[65vh] items-center justify-center">
          <Loader2 size={30} className="animate-spin text-slate-400" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/people/training"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training Register
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <GraduationCap size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Management
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Courses
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Plan training, allocate employees, manage attendance and bulk-create
                employee training records after successful completion.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                onClick={openNewCourse}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                Add Course
              </button>
            </div>
          </div>
        </section>

        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
              message.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {message.text}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Upcoming Courses"
            value={upcomingCount}
            detail="Booked or confirmed"
            icon={<CalendarDays size={20} />}
          />
          <MetricCard
            label="Employees Allocated"
            value={attendees.length}
            detail="Across all courses"
            icon={<Users size={20} />}
          />
          <MetricCard
            label="Attendance Outstanding"
            value={awaitingAttendanceCount}
            detail="Courses requiring completion"
            icon={<ClipboardCheck size={20} />}
          />
          <MetricCard
            label="Certificates Outstanding"
            value={awaitingCertificatesCount}
            detail="Passed attendees not processed"
            icon={<FileUp size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search course, provider, venue or project..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:ring-2"
              />
            </label>

            <SelectField
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "draft", label: "Draft" },
                { value: "booked", label: "Booked" },
                { value: "confirmed", label: "Confirmed" },
                { value: "in_progress", label: "In progress" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Course Register</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredCourses.length} course{filteredCourses.length === 1 ? "" : "s"} shown.
              </p>
            </div>

            {filteredCourses.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No courses match the current filters.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredCourses.map((course) => {
                  const type = typeById.get(course.training_type_id);
                  const project = course.project_id
                    ? projectById.get(course.project_id)
                    : null;
                  const list = attendeesByCourse.get(course.id) ?? [];

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`w-full p-5 text-left hover:bg-slate-50 ${
                        selectedCourseId === course.id ? "bg-slate-50" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-950">{course.title}</h3>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${courseStatusClasses(
                                course.status,
                              )}`}
                            >
                              {course.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-700">
                            {type?.name ?? "Unknown training type"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays size={14} />
                              {formatDateTime(course.start_at)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={14} />
                              {course.venue || "Venue not set"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Users size={14} />
                              {list.length}
                              {course.max_attendees ? ` / ${course.max_attendees}` : ""} allocated
                            </span>
                          </div>
                          {project ? (
                            <div className="mt-2 text-xs font-medium text-blue-700">
                              {project.project_number
                                ? `${project.project_number} · ${project.name}`
                                : project.name}
                            </div>
                          ) : null}
                        </div>

                        <div className="text-right text-xs text-slate-500">
                          <div>{course.provider || "Provider not set"}</div>
                          <div className="mt-1">
                            {list.filter((item) => item.result_status === "passed").length} passed
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            {!selectedCourse ? (
              <div className="flex min-h-[420px] items-center justify-center p-10 text-center">
                <div>
                  <GraduationCap size={34} className="mx-auto text-slate-300" />
                  <h3 className="mt-4 font-bold text-slate-900">Select a course</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Open a course to manage allocations, attendance and completion.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="border-b border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-950">
                        {selectedCourse.title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {typeById.get(selectedCourse.training_type_id)?.name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCourseId(null)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditCourse(selectedCourse)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openAllocation(selectedCourse)}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      <UserPlus size={15} />
                      Allocate
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletionModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <BadgeCheck size={15} />
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCourse(selectedCourse)}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 size={15} />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2">
                  <Detail label="Start" value={formatDateTime(selectedCourse.start_at)} />
                  <Detail label="End" value={formatDateTime(selectedCourse.end_at)} />
                  <Detail label="Provider" value={selectedCourse.provider || "Not set"} />
                  <Detail label="Trainer" value={selectedCourse.trainer_name || "Not set"} />
                  <Detail label="Venue" value={selectedCourse.venue || "Not set"} />
                  <Detail
                    label="Project"
                    value={
                      selectedCourse.project_id
                        ? projectById.get(selectedCourse.project_id)?.name ?? "Unknown"
                        : "Company-wide"
                    }
                  />
                </div>

                <div className="p-5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-950">Allocated Employees</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {selectedCourseAttendees.length} allocated
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAllocation(selectedCourse)}
                      className="text-sm font-semibold text-blue-700"
                    >
                      Add people
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedCourseAttendees.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                        No employees allocated.
                      </div>
                    ) : (
                      selectedCourseAttendees.map((attendee) => {
                        const employee = employeeById.get(attendee.employee_id);
                        return (
                          <div
                            key={attendee.id}
                            className="rounded-2xl border border-slate-200 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-bold text-slate-900">
                                  {employee?.full_name ?? "Unknown employee"}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {employee?.role || "Role not set"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void removeAttendee(attendee)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <CompactSelect
                                value={attendee.attendance_status}
                                onChange={(value) =>
                                  void updateAttendee(attendee.id, {
                                    attendance_status:
                                      value as Attendee["attendance_status"],
                                  })
                                }
                                options={[
                                  ["pending", "Attendance pending"],
                                  ["attended", "Attended"],
                                  ["did_not_attend", "Did not attend"],
                                  ["part_attended", "Part attended"],
                                  ["cancelled", "Cancelled"],
                                ]}
                              />
                              <CompactSelect
                                value={attendee.result_status}
                                onChange={(value) =>
                                  void updateAttendee(attendee.id, {
                                    result_status:
                                      value as Attendee["result_status"],
                                  })
                                }
                                options={[
                                  ["pending", "Result pending"],
                                  ["passed", "Passed"],
                                  ["failed", "Failed"],
                                  ["not_assessed", "Not assessed"],
                                  ["cancelled", "Cancelled"],
                                ]}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {courseModalOpen ? (
        <Modal title={editingCourseId ? "Edit Course" : "Create Course"} onClose={() => setCourseModalOpen(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course title">
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="Training type">
              <select
                value={form.training_type_id}
                onChange={(event) =>
                  setForm({ ...form, training_type_id: event.target.value })
                }
                className="input"
              >
                <option value="">Select training type</option>
                {trainingTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.category ? `${type.category} · ` : ""}
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select
                value={form.project_id}
                onChange={(event) => setForm({ ...form, project_id: event.target.value })}
                className="input"
              >
                <option value="">Company-wide</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number
                      ? `${project.project_number} · ${project.name}`
                      : project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as Course["status"] })
                }
                className="input"
              >
                {["draft", "booked", "confirmed", "in_progress", "completed", "cancelled"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Start">
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(event) => setForm({ ...form, start_at: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="End">
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(event) => setForm({ ...form, end_at: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="Provider">
              <input
                value={form.provider}
                onChange={(event) => setForm({ ...form, provider: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="Trainer">
              <input
                value={form.trainer_name}
                onChange={(event) => setForm({ ...form, trainer_name: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="Venue">
              <input
                value={form.venue}
                onChange={(event) => setForm({ ...form, venue: event.target.value })}
                className="input"
              />
            </Field>
            <Field label="Delivery mode">
              <select
                value={form.delivery_mode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    delivery_mode: event.target.value as Course["delivery_mode"],
                  })
                }
                className="input"
              >
                <option value="face_to_face">Face to face</option>
                <option value="online">Online</option>
                <option value="blended">Blended</option>
                <option value="onsite">Onsite</option>
              </select>
            </Field>
            <Field label="Maximum attendees">
              <input
                type="number"
                min="1"
                value={form.max_attendees}
                onChange={(event) =>
                  setForm({ ...form, max_attendees: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Booking reference">
              <input
                value={form.booking_reference}
                onChange={(event) =>
                  setForm({ ...form, booking_reference: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Cost per person">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_per_person}
                onChange={(event) =>
                  setForm({ ...form, cost_per_person: event.target.value })
                }
                className="input"
              />
            </Field>
            <Field label="Total cost">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.total_cost}
                onChange={(event) =>
                  setForm({ ...form, total_cost: event.target.value })
                }
                className="input"
              />
            </Field>
          </div>

          <Field label="Joining instructions">
            <textarea
              value={form.joining_instructions}
              onChange={(event) =>
                setForm({ ...form, joining_instructions: event.target.value })
              }
              rows={3}
              className="input"
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              rows={3}
              className="input"
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["reminder_7_days", "Reminder 7 days before"],
              ["reminder_2_days", "Reminder 2 days before"],
              ["reminder_day_of", "Reminder on course day"],
              ["reminder_certificates_3_days", "Certificate reminder after 3 days"],
              ["reminder_certificates_7_days", "Certificate reminder after 7 days"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof CourseForm])}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <ModalActions
            saving={saving}
            onCancel={() => setCourseModalOpen(false)}
            onSave={() => void saveCourse()}
            saveLabel={editingCourseId ? "Save Changes" : "Create Course"}
          />
        </Modal>
      ) : null}

      {allocationModalOpen && selectedCourse ? (
        <Modal title={`Allocate Employees · ${selectedCourse.title}`} onClose={() => setAllocationModalOpen(false)}>
          <label className="relative block">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="Search employee or role..."
              className="input pl-10"
            />
          </label>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {employees
              .filter((employee) => {
                const q = employeeSearch.trim().toLowerCase();
                return !q || `${employee.full_name} ${employee.role ?? ""}`.toLowerCase().includes(q);
              })
              .map((employee) => {
                const alreadyAllocated = selectedCourseAttendees.some(
                  (attendee) => attendee.employee_id === employee.id,
                );
                const checked = selectedEmployeeIds.includes(employee.id);

                return (
                  <label
                    key={employee.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                      alreadyAllocated
                        ? "border-slate-200 bg-slate-50 opacity-60"
                        : checked
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {employee.full_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {employee.role || "Role not set"}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={alreadyAllocated}
                      checked={checked || alreadyAllocated}
                      onChange={(event) =>
                        setSelectedEmployeeIds((current) =>
                          event.target.checked
                            ? [...current, employee.id]
                            : current.filter((id) => id !== employee.id),
                        )
                      }
                    />
                  </label>
                );
              })}
          </div>

          <ModalActions
            saving={saving}
            onCancel={() => setAllocationModalOpen(false)}
            onSave={() => void allocateEmployees()}
            saveLabel={`Allocate ${selectedEmployeeIds.length || ""}`.trim()}
          />
        </Modal>
      ) : null}

      {completionModalOpen && selectedCourse ? (
        <Modal title={`Complete Course · ${selectedCourse.title}`} onClose={() => setCompletionModalOpen(false)}>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void markAllAttended()}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Mark all attended
            </button>
            <button
              type="button"
              onClick={() => void markAllPassed()}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              Mark attendees passed
            </button>
          </div>

          <div className="max-h-[58vh] space-y-3 overflow-y-auto">
            {selectedCourseAttendees.map((attendee) => {
              const employee = employeeById.get(attendee.employee_id);
              return (
                <div key={attendee.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="font-bold text-slate-950">
                    {employee?.full_name ?? "Unknown employee"}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <CompactSelect
                      value={attendee.attendance_status}
                      onChange={(value) =>
                        void updateAttendee(attendee.id, {
                          attendance_status: value as Attendee["attendance_status"],
                        })
                      }
                      options={[
                        ["pending", "Attendance pending"],
                        ["attended", "Attended"],
                        ["did_not_attend", "Did not attend"],
                        ["part_attended", "Part attended"],
                        ["cancelled", "Cancelled"],
                      ]}
                    />
                    <CompactSelect
                      value={attendee.result_status}
                      onChange={(value) =>
                        void updateAttendee(attendee.id, {
                          result_status: value as Attendee["result_status"],
                        })
                      }
                      options={[
                        ["pending", "Result pending"],
                        ["passed", "Passed"],
                        ["failed", "Failed"],
                        ["not_assessed", "Not assessed"],
                        ["cancelled", "Cancelled"],
                      ]}
                    />
                    <input
                      placeholder="Certificate number"
                      value={attendee.certificate_number ?? ""}
                      onChange={(event) =>
                        void updateAttendee(attendee.id, {
                          certificate_number: event.target.value,
                        })
                      }
                      className="input"
                    />
                    <input
                      type="date"
                      value={attendee.issue_date ?? ""}
                      onChange={(event) =>
                        void updateAttendee(attendee.id, {
                          issue_date: event.target.value || null,
                        })
                      }
                      className="input"
                    />
                    <input
                      type="date"
                      value={attendee.expiry_date ?? ""}
                      onChange={(event) =>
                        void updateAttendee(attendee.id, {
                          expiry_date: event.target.value || null,
                        })
                      }
                      className="input"
                    />
                    <input
                      placeholder="SharePoint certificate URL"
                      value={attendee.certificate_sharepoint_url ?? ""}
                      onChange={(event) =>
                        void updateAttendee(attendee.id, {
                          certificate_sharepoint_url: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={attendee.does_not_expire}
                      onChange={(event) =>
                        void updateAttendee(attendee.id, {
                          does_not_expire: event.target.checked,
                        })
                      }
                    />
                    Does not expire
                  </label>

                  {attendee.employee_training_record_id ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <Check size={14} />
                      Training record created
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <ModalActions
            saving={saving}
            onCancel={() => setCompletionModalOpen(false)}
            onSave={() => void processCompletion()}
            saveLabel="Create Training Records"
          />
        </Modal>
      ) : null}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(51 65 85);
          outline: none;
        }
        .input:focus {
          box-shadow: 0 0 0 2px rgb(226 232 240);
        }
      `}</style>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-600">{label}</div>
          <div className="mt-2 text-3xl font-bold text-slate-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">{icon}</div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input appearance-none pr-9"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </label>
  );
}

function CompactSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="input"
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-semibold text-slate-700">{label}</div>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  onCancel,
  onSave,
  saveLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-5">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : null}
        {saveLabel}
      </button>
    </div>
  );
}
