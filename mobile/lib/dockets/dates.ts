// Daily Docket dates are stored internally as ISO YYYY-MM-DD so Supabase and
// the website APIs remain stable. Mobile users see and enter DD-MM-YYYY.

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function validDateParts(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return false;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function formatDocketDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (validDateParts(day, month, year)) {
      return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
    }
  }

  const au = raw.match(/^(\d{1,2})[\-/.\s](\d{1,2})[\-/.\s](\d{4})$/);
  if (au) {
    const day = Number(au[1]);
    const month = Number(au[2]);
    const year = Number(au[3]);
    if (validDateParts(day, month, year)) {
      return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
    }
  }

  return raw;
}

export function parseDocketDateInput(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return validDateParts(day, month, year) ? raw : raw;
  }

  const compact = raw.replace(/[^0-9]/g, "");
  if (compact.length === 8) {
    const day = Number(compact.slice(0, 2));
    const month = Number(compact.slice(2, 4));
    const year = Number(compact.slice(4, 8));
    if (validDateParts(day, month, year)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const au = raw.match(/^(\d{1,2})[\-/.\s](\d{1,2})[\-/.\s](\d{4})$/);
  if (au) {
    const day = Number(au[1]);
    const month = Number(au[2]);
    const year = Number(au[3]);
    if (validDateParts(day, month, year)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Preserve partial typing. Once DD-MM-YYYY is complete it becomes ISO.
  return raw;
}

export function isValidStoredDocketDate(value: unknown) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  return validDateParts(Number(match[3]), Number(match[2]), Number(match[1]));
}
