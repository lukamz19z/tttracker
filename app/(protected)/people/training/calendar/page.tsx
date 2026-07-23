"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GraduationCap,
  List,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

type TrainingType = {
  id: string;
  name: string;
  category: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  role: string | null;
  active: boolean | null;
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
  result_status:
    | "pending"
    | "passed"
    | "failed"
    | "not_assessed"
    | "cancelled";
};

type CalendarView = "month" | "agenda";

type CalendarDay = {
  date: Date;
  isoDate: string;
  currentMonth: boolean;
  isToday: boolean;
  courses: Course[];
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalise(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatIsoDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return "Not set";

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function projectLabel(project: Project | null | undefined) {
  if (!project) return "Company-wide";
  return project.project_number
    ? `${project.project_number} · ${project.name}`
    : project.name;
}

function statusClasses(status: Course["status"]) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "confirmed") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "in_progress") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (status === "booked") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function calendarCourseClasses(status: Course["status"]) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  }

  if (status === "confirmed") {
    return "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100";
  }

  if (status === "in_progress") {
    return "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100";
  }

  if (status === "booked") {
    return "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100";
  }

  if (status === "cancelled") {
    return "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";
  }

  return "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";
}

function buildCalendarDays(
  referenceDate: Date,
  coursesByDate: Map<string, Course[]>,
): CalendarDay[] {
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);
  const mondayIndex = (monthStart.getDay() + 6) % 7;
  const firstVisibleDate = addDays(monthStart, -mondayIndex);

  const finalDayIndex = (monthEnd.getDay() + 6) % 7;
  const trailingDays = 6 - finalDayIndex;
  const lastVisibleDate = addDays(monthEnd, trailingDays);

  const days: CalendarDay[] = [];
  const today = startOfDay(new Date());

  for (
    let cursor = firstVisibleDate;
    cursor <= lastVisibleDate;
    cursor = addDays(cursor, 1)
  ) {
    const isoDate = formatIsoDate(cursor);

    days.push({
      date: cursor,
      isoDate,
      currentMonth: cursor.getMonth() === referenceDate.getMonth(),
      isToday: startOfDay(cursor).getTime() === today.getTime(),
      courses: coursesByDate.get(isoDate) ?? [],
    });
  }

  return days;
}

export default function TrainingCalendarPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [courses, setCourses] = useState<Course[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  const [referenceDate, setReferenceDate] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<CalendarView>("month");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [trainingTypeFilter, setTrainingTypeFilter] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    const [courseResult, typeResult, projectResult, employeeResult, attendeeResult] =
      await Promise.all([
        supabase
          .from("training_courses")
          .select("*")
          .order("start_at", { ascending: true }),
        supabase
          .from("training_types")
          .select("id, name, category, active")
          .order("category")
          .order("name"),
        supabase
          .from("projects")
          .select("id, name, project_number, status")
          .order("name"),
        supabase
          .from("employees")
          .select("id, full_name, role, active")
          .eq("active", true)
          .order("full_name"),
        supabase
          .from("training_course_attendees")
          .select(
            "id, course_id, employee_id, allocation_status, attendance_status, result_status",
          ),
      ]);

    const error =
      courseResult.error ||
      typeResult.error ||
      projectResult.error ||
      employeeResult.error ||
      attendeeResult.error;

    if (error) throw new Error(error.message);

    setCourses((courseResult.data ?? []) as Course[]);
    setTrainingTypes((typeResult.data ?? []) as TrainingType[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setAttendees((attendeeResult.data ?? []) as Attendee[]);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadData();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load the training calendar.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadData]);

  const trainingTypeById = useMemo(
    () => new Map(trainingTypes.map((item) => [item.id, item])),
    [trainingTypes],
  );

  const projectById = useMemo(
    () => new Map(projects.map((item) => [item.id, item])),
    [projects],
  );

  const employeeById = useMemo(
    () => new Map(employees.map((item) => [item.id, item])),
    [employees],
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

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return courses.filter((course) => {
      if (!showCancelled && course.status === "cancelled") return false;
      if (statusFilter !== "all" && course.status !== statusFilter) return false;
      if (
        projectFilter !== "all" &&
        (course.project_id ?? "company") !== projectFilter
      ) {
        return false;
      }
      if (
        trainingTypeFilter !== "all" &&
        course.training_type_id !== trainingTypeFilter
      ) {
        return false;
      }

      if (!query) return true;

      const type = trainingTypeById.get(course.training_type_id);
      const project = course.project_id
        ? projectById.get(course.project_id)
        : null;
      const allocatedEmployees = (attendeesByCourse.get(course.id) ?? [])
        .map((attendee) => employeeById.get(attendee.employee_id)?.full_name)
        .filter(Boolean)
        .join(" ");

      return [
        course.title,
        course.provider,
        course.trainer_name,
        course.venue,
        course.booking_reference,
        course.notes,
        type?.name,
        type?.category,
        project?.name,
        project?.project_number,
        allocatedEmployees,
      ]
        .map(clean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [
    attendeesByCourse,
    courses,
    employeeById,
    projectById,
    projectFilter,
    search,
    showCancelled,
    statusFilter,
    trainingTypeById,
    trainingTypeFilter,
  ]);

  const coursesByDate = useMemo(() => {
    const map = new Map<string, Course[]>();

    filteredCourses.forEach((course) => {
      const courseStart = new Date(course.start_at);
      const courseEnd = new Date(course.end_at);

      if (
        Number.isNaN(courseStart.getTime()) ||
        Number.isNaN(courseEnd.getTime())
      ) {
        return;
      }

      let cursor = startOfDay(courseStart);
      const finalDay = startOfDay(courseEnd);

      while (cursor <= finalDay) {
        const key = formatIsoDate(cursor);
        const list = map.get(key) ?? [];
        list.push(course);
        map.set(key, list);
        cursor = addDays(cursor, 1);
      }
    });

    map.forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      ),
    );

    return map;
  }, [filteredCourses]);

  const calendarDays = useMemo(
    () => buildCalendarDays(referenceDate, coursesByDate),
    [coursesByDate, referenceDate],
  );

  const agendaCourses = useMemo(() => {
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = endOfMonth(referenceDate);

    return filteredCourses
      .filter((course) => {
        const start = new Date(course.start_at);
        const end = new Date(course.end_at);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return false;
        }

        return start <= monthEnd && end >= monthStart;
      })
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );
  }, [filteredCourses, referenceDate]);

  const selectedCourse =
    courses.find((course) => course.id === selectedCourseId) ?? null;

  const selectedCourseAttendees = selectedCourse
    ? attendeesByCourse.get(selectedCourse.id) ?? []
    : [];

  const monthCourses = agendaCourses.length;
  const monthAllocated = agendaCourses.reduce(
    (sum, course) => sum + (attendeesByCourse.get(course.id)?.length ?? 0),
    0,
  );
  const monthConfirmed = agendaCourses.filter((course) =>
    ["confirmed", "in_progress"].includes(course.status),
  ).length;
  const monthCompleted = agendaCourses.filter(
    (course) => course.status === "completed",
  ).length;

  async function refreshData() {
    setRefreshing(true);
    setMessage(null);

    try {
      await loadData();
      setMessage({
        tone: "success",
        text: "Training calendar refreshed.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to refresh the training calendar.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  function goToToday() {
    setReferenceDate(startOfMonth(new Date()));
  }

  function moveMonth(direction: number) {
    setReferenceDate((current) => addMonths(current, direction));
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
                href="/people/training/dashboard"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                Back to Training Dashboard
              </Link>

              <div className="mt-5 flex items-center gap-2 text-slate-400">
                <CalendarDays size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Training Management
                </span>
              </div>

              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                Training Calendar
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                View upcoming and completed training by month, project, course
                type and status. Open any course to review provider details,
                attendee allocations and completion progress.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refreshData()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </button>

              <Link
                href="/people/training/courses"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={16} />
                Manage Courses
              </Link>
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
            label="Courses This Month"
            value={monthCourses}
            detail="Matching current filters"
            icon={<GraduationCap size={20} />}
          />
          <MetricCard
            label="People Allocated"
            value={monthAllocated}
            detail="Across visible courses"
            icon={<Users size={20} />}
          />
          <MetricCard
            label="Confirmed / Active"
            value={monthConfirmed}
            detail="Ready or currently running"
            icon={<Clock3 size={20} />}
          />
          <MetricCard
            label="Completed"
            value={monthCompleted}
            detail="Completed in this month"
            icon={<CalendarDays size={20} />}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_200px_220px_220px]">
            <label className="relative block">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search courses, providers, projects or attendees..."
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

            <SelectField
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: "all", label: "All projects" },
                { value: "company", label: "Company-wide" },
                ...projects.map((project) => ({
                  value: project.id,
                  label: projectLabel(project),
                })),
              ]}
            />

            <SelectField
              value={trainingTypeFilter}
              onChange={setTrainingTypeFilter}
              options={[
                { value: "all", label: "All training types" },
                ...trainingTypes
                  .filter((type) => type.active !== false)
                  .map((type) => ({
                    value: type.id,
                    label: type.category
                      ? `${type.category} · ${type.name}`
                      : type.name,
                  })),
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(event) => setShowCancelled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Show cancelled courses
            </label>

            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setView("month")}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  view === "month"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <CalendarDays size={16} />
                Month
              </button>
              <button
                type="button"
                onClick={() => setView("agenda")}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  view === "agenda"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <List size={16} />
                Agenda
              </button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                {formatMonthTitle(referenceDate)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {agendaCourses.length} course
                {agendaCourses.length === 1 ? "" : "s"} in this month.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                type="button"
                onClick={goToToday}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {view === "month" ? (
            <MonthCalendar
              days={calendarDays}
              selectedCourseId={selectedCourseId}
              onCourseClick={setSelectedCourseId}
            />
          ) : (
            <AgendaView
              courses={agendaCourses}
              attendeesByCourse={attendeesByCourse}
              trainingTypeById={trainingTypeById}
              projectById={projectById}
              onCourseClick={setSelectedCourseId}
            />
          )}
        </section>
      </div>

      {selectedCourse ? (
        <CourseDrawer
          course={selectedCourse}
          trainingType={trainingTypeById.get(selectedCourse.training_type_id)}
          project={
            selectedCourse.project_id
              ? projectById.get(selectedCourse.project_id)
              : null
          }
          attendees={selectedCourseAttendees}
          employeeById={employeeById}
          onClose={() => setSelectedCourseId(null)}
        />
      ) : null}
    </AppShell>
  );
}

function MonthCalendar({
  days,
  selectedCourseId,
  onCourseClick,
}: {
  days: CalendarDay[];
  selectedCourseId: string | null;
  onCourseClick: (courseId: string) => void;
}) {
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-3 py-3 text-center text-xs font-bold uppercase tracking-wide text-slate-500"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => (
            <div
              key={day.isoDate}
              className={`min-h-[150px] border-b border-r border-slate-100 p-2 ${
                day.currentMonth ? "bg-white" : "bg-slate-50/70"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold ${
                    day.isToday
                      ? "bg-slate-950 text-white"
                      : day.currentMonth
                        ? "text-slate-700"
                        : "text-slate-400"
                  }`}
                >
                  {day.date.getDate()}
                </span>

                {day.courses.length > 0 ? (
                  <span className="text-[11px] font-semibold text-slate-400">
                    {day.courses.length}
                  </span>
                ) : null}
              </div>

              <div className="mt-2 space-y-1.5">
                {day.courses.slice(0, 4).map((course) => (
                  <button
                    key={`${day.isoDate}-${course.id}`}
                    type="button"
                    onClick={() => onCourseClick(course.id)}
                    className={`block w-full rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold leading-4 transition ${calendarCourseClasses(
                      course.status,
                    )} ${
                      selectedCourseId === course.id
                        ? "ring-2 ring-slate-300"
                        : ""
                    }`}
                  >
                    <div className="truncate">
                      {formatTime(course.start_at)} · {course.title}
                    </div>
                    {course.venue ? (
                      <div className="mt-0.5 truncate font-normal opacity-75">
                        {course.venue}
                      </div>
                    ) : null}
                  </button>
                ))}

                {day.courses.length > 4 ? (
                  <div className="px-1 text-[11px] font-semibold text-slate-400">
                    +{day.courses.length - 4} more
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaView({
  courses,
  attendeesByCourse,
  trainingTypeById,
  projectById,
  onCourseClick,
}: {
  courses: Course[];
  attendeesByCourse: Map<string, Attendee[]>;
  trainingTypeById: Map<string, TrainingType>;
  projectById: Map<string, Project>;
  onCourseClick: (courseId: string) => void;
}) {
  if (courses.length === 0) {
    return (
      <div className="p-12 text-center">
        <CalendarDays size={34} className="mx-auto text-slate-300" />
        <h3 className="mt-4 text-lg font-bold text-slate-900">
          No courses this month
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          Change the month or filters to display more courses.
        </p>
      </div>
    );
  }

  const grouped = new Map<string, Course[]>();

  courses.forEach((course) => {
    const key = formatIsoDate(new Date(course.start_at));
    const list = grouped.get(key) ?? [];
    list.push(course);
    grouped.set(key, list);
  });

  return (
    <div className="divide-y divide-slate-100">
      {Array.from(grouped.entries()).map(([dateKey, dayCourses]) => (
        <section key={dateKey} className="p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
            {formatDate(new Date(`${dateKey}T00:00:00`))}
          </h3>

          <div className="mt-3 space-y-3">
            {dayCourses.map((course) => {
              const attendees = attendeesByCourse.get(course.id) ?? [];
              const trainingType = trainingTypeById.get(course.training_type_id);
              const project = course.project_id
                ? projectById.get(course.project_id)
                : null;

              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onCourseClick(course.id)}
                  className="grid w-full gap-4 rounded-2xl border border-slate-200 p-4 text-left hover:bg-slate-50 md:grid-cols-[100px_minmax(0,1fr)_auto] md:items-center"
                >
                  <div>
                    <div className="text-base font-bold text-slate-950">
                      {formatTime(course.start_at)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      to {formatTime(course.end_at)}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-950">
                        {course.title}
                      </h4>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(
                          course.status,
                        )}`}
                      >
                        {course.status.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="mt-1 text-sm font-semibold text-slate-700">
                      {trainingType?.name ?? "Unknown training type"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={13} />
                        {course.venue || "Venue not set"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={13} />
                        {attendees.length} allocated
                      </span>
                      <span>{projectLabel(project)}</span>
                    </div>
                  </div>

                  <ChevronRight size={18} className="text-slate-300" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function CourseDrawer({
  course,
  trainingType,
  project,
  attendees,
  employeeById,
  onClose,
}: {
  course: Course;
  trainingType: TrainingType | undefined;
  project: Project | null | undefined;
  attendees: Attendee[];
  employeeById: Map<string, Employee>;
  onClose: () => void;
}) {
  const attended = attendees.filter(
    (attendee) => attendee.attendance_status === "attended",
  ).length;
  const passed = attendees.filter(
    (attendee) => attendee.result_status === "passed",
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Training Course
            </div>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">
              {course.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {trainingType?.name ?? "Unknown training type"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(
                course.status,
              )}`}
            >
              {course.status.replaceAll("_", " ")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {course.delivery_mode.replaceAll("_", " ")}
            </span>
          </div>

          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Detail label="Starts" value={formatDateTime(course.start_at)} />
            <Detail label="Ends" value={formatDateTime(course.end_at)} />
            <Detail label="Venue" value={course.venue || "Not set"} />
            <Detail label="Project" value={projectLabel(project)} />
            <Detail label="Provider" value={course.provider || "Not set"} />
            <Detail label="Trainer" value={course.trainer_name || "Not set"} />
            <Detail
              label="Booking reference"
              value={course.booking_reference || "Not set"}
            />
            <Detail
              label="Capacity"
              value={
                course.max_attendees
                  ? `${attendees.length} of ${course.max_attendees}`
                  : `${attendees.length} allocated`
              }
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Allocated"
              value={attendees.length}
              detail="Employees"
            />
            <SummaryTile
              label="Attended"
              value={attended}
              detail="Marked attended"
            />
            <SummaryTile label="Passed" value={passed} detail="Successful" />
          </section>

          {course.joining_instructions ? (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Joining Instructions
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {course.joining_instructions}
              </p>
            </section>
          ) : null}

          {course.notes ? (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                Notes
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {course.notes}
              </p>
            </section>
          ) : null}

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  Allocated Employees
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Attendance and result summary.
                </p>
              </div>

              <Link
                href="/people/training/courses"
                className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Manage course
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {attendees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No employees have been allocated.
                </div>
              ) : (
                attendees.map((attendee) => {
                  const employee = employeeById.get(attendee.employee_id);

                  return (
                    <div
                      key={attendee.id}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-bold text-slate-950">
                            {employee?.full_name ?? "Unknown employee"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {employee?.role || "Role not set"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {attendee.attendance_status.replaceAll("_", " ")}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {attendee.result_status.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
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
          <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-500">{detail}</div>
        </div>
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
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
      <Filter
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-medium text-slate-700 outline-none ring-slate-200 focus:ring-2"
      >
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronRight
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400"
      />
    </label>
  );
}
