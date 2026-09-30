"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UploadCloud,
  UserRound,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { createSupabaseBrowser } from "@/lib/supabase";

/* =========================================================
   Types
   ========================================================= */

type Employee = {
  id: string;
  payroll_id: string | null;
  full_name: string;
  role: string | null;
  user_id: string | null;
  active: boolean | null;
};

type Project = {
  id: string;
  name: string;
  project_number: string | null;
  status: string | null;
};

type TrainingType = {
  id: string;
  category_id: string | null;
  name: string;
  short_code: string | null;
  category: string | null;
  active: boolean | null;

  requires_issue_date: boolean | null;
  requires_expiry_date: boolean | null;
  allows_no_expiry: boolean | null;

  validity_mode: string | null;
  validity_interval_value: number | null;
  validity_interval_unit: string | null;

  requires_certificate_number: boolean | null;
  requires_issuer: boolean | null;
  requires_project: boolean | null;
  requires_document: boolean | null;

  document_upload_type: string | null;

  allows_multiple_current: boolean | null;
  subtype_mode: string | null;
  requires_review: boolean | null;
};

type TrainingOption = {
  id: string;
  training_type_id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean | null;
  sort_order: number | null;
};

type CustomField = {
  id: string;
  training_type_id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  active: boolean;
  sort_order: number;
};

type ExistingRecord = {
  id: string;
  employee_id: string;
  training_type_id: string | null;
  certificate_number: string | null;
  option_codes: string[] | null;
  class_codes: string[] | null;
  issue_date: string | null;
  expiry_date: string | null;
  workflow_status: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
  revoked_at: string | null;
};

type Message = {
  tone: "success" | "error";
  text: string;
};

/* =========================================================
   Helpers
   ========================================================= */

function clean(value: unknown) {
  return String(value ?? "").trim();
}

const TRAINING_IMAGE_TARGET_BYTES = 1_400_000;

/**
 * We are still using the current Training FormData API.
 * Keep the combined request comfortably below the deployment body limit.
 */
const TRAINING_REQUEST_SAFE_BYTES = 4_000_000;

function replaceFileExtension(fileName: string, extension: string) {
  const base =
    fileName.replace(/\.[^.]+$/, "") ||
    "training-evidence";

  return `${base}.${extension}`;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/**
 * Compress large phone photos before sending them through
 * the existing Training upload API.
 *
 * PDFs are not altered.
 */
async function prepareTrainingUploadFile(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.size <= TRAINING_IMAGE_TARGET_BYTES) {
    return file;
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      `${file.name} could not be prepared. Save the photo as JPG or PNG and try again.`,
    );
  }

  try {
    const longestSide = Math.max(bitmap.width, bitmap.height);

    const initialScale = Math.min(
      1,
      2200 / Math.max(longestSide, 1),
    );

    let bestBlob: Blob | null = null;

    for (let sizePass = 0; sizePass < 5; sizePass += 1) {
      const passScale =
        initialScale * Math.pow(0.84, sizePass);

      const width = Math.max(
        1,
        Math.round(bitmap.width * passScale),
      );

      const height = Math.max(
        1,
        Math.round(bitmap.height * passScale),
      );

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", {
        alpha: false,
      });

      if (!context) {
        throw new Error(
          "This browser could not prepare the Training photo.",
        );
      }

      context.drawImage(
        bitmap,
        0,
        0,
        width,
        height,
      );

      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const blob = await canvasBlob(
          canvas,
          "image/jpeg",
          quality,
        );

        if (!blob) {
          continue;
        }

        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }

        if (blob.size <= TRAINING_IMAGE_TARGET_BYTES) {
          return new File(
            [blob],
            replaceFileExtension(file.name, "jpg"),
            {
              type: "image/jpeg",
              lastModified: file.lastModified,
            },
          );
        }
      }
    }

    if (!bestBlob) {
      throw new Error(
        `${file.name} could not be compressed.`,
      );
    }

    return new File(
      [bestBlob],
      replaceFileExtension(file.name, "jpg"),
      {
        type: "image/jpeg",
        lastModified: file.lastModified,
      },
    );
  } finally {
    bitmap.close();
  }
}

function normaliseRole(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Existing compatibility behaviour.
 *
 * Server-side Training permissions remain authoritative.
 */
function canManageOtherEmployees(role: string) {
  return [
    "admin",
    "administrator",
    "site_admin",
    "hseq",
    "safety",
    "safety_officer",
  ].includes(normaliseRole(role));
}

function addInterval(
  issueDate: string,
  value: number | null,
  unit: string | null,
) {
  if (!issueDate || !value || !unit) {
    return "";
  }

  const date = new Date(`${issueDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (unit === "days") {
    date.setDate(date.getDate() + value);
  }

  if (unit === "weeks") {
    date.setDate(date.getDate() + value * 7);
  }

  if (unit === "months") {
    date.setMonth(date.getMonth() + value);
  }

  if (unit === "years") {
    date.setFullYear(date.getFullYear() + value);
  }

  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(
    `${value.slice(0, 10)}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function fieldOptions(value: unknown) {
  return Array.isArray(value)
    ? value.map(String)
    : [];
}

/* =========================================================
   Page
   ========================================================= */

export default function AddTrainingRecordPage() {
  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  const [currentRole, setCurrentRole] = useState("");
  const [selfEmployeeId, setSelfEmployeeId] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [options, setOptions] = useState<TrainingOption[]>([]);
  const [customFields, setCustomFields] =
    useState<CustomField[]>([]);

  const [employeeId, setEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] =
    useState<string[]>([]);

  const [projectId, setProjectId] = useState("");
  const [issuer, setIssuer] = useState("");
  const [certificateNumber, setCertificateNumber] =
    useState("");

  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const [notes, setNotes] = useState("");

  const [metadata, setMetadata] = useState<
    Record<string, unknown>
  >({});

  const [singleFile, setSingleFile] =
    useState<File | null>(null);

  const [frontFile, setFrontFile] =
    useState<File | null>(null);

  const [backFile, setBackFile] =
    useState<File | null>(null);

  const [
    flexibleEvidenceMode,
    setFlexibleEvidenceMode,
  ] = useState<"single" | "front_back">("single");

  const [existingRecords, setExistingRecords] =
    useState<ExistingRecord[]>([]);

  const [replaceChoice, setReplaceChoice] = useState<
    "replace" | "add" | null
  >(null);

  const [replaceRecordId, setReplaceRecordId] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] =
    useState<Message | null>(null);

  /* =======================================================
     Authenticated fetch
     ======================================================= */

  const apiFetch = useCallback(
    async (
      url: string,
      init: RequestInit = {},
    ) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your session has expired. Please sign in again.",
        );
      }

      const headers = new Headers(init.headers);

      headers.set(
        "Authorization",
        `Bearer ${session.access_token}`,
      );

      return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
      });
    },
    [supabase],
  );

  /* =======================================================
     Reference data
     ======================================================= */

  const loadReferenceData = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      throw new Error(
        "You must be signed in.",
      );
    }

    const [
      roleResult,
      employeeResult,
      projectResult,
      typeResult,
      optionResult,
      fieldResult,
    ] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabase
        .from("employees")
        .select(
          "id,payroll_id,full_name,role,user_id,active",
        )
        .eq("active", true)
        .order("full_name"),

      supabase
        .from("projects")
        .select(
          "id,name,project_number,status",
        )
        .order("name"),

      supabase
        .from("training_types")
        .select(
          "id,category_id,name,short_code,category,active,requires_issue_date,requires_expiry_date,allows_no_expiry,validity_mode,validity_interval_value,validity_interval_unit,requires_certificate_number,requires_issuer,requires_project,requires_document,document_upload_type,allows_multiple_current,subtype_mode,requires_review",
        )
        .eq("active", true)
        .order("sort_order")
        .order("name"),

      supabase
        .from("training_type_options")
        .select(
          "id,training_type_id,name,code,description,active,sort_order",
        )
        .eq("active", true)
        .order("sort_order")
        .order("name"),

      supabase
        .from("training_type_fields")
        .select(
          "id,training_type_id,field_key,label,field_type,required,options,placeholder,help_text,active,sort_order",
        )
        .eq("active", true)
        .order("sort_order"),
    ]);

    const errors = [
      roleResult.error,
      employeeResult.error,
      projectResult.error,
      typeResult.error,
      optionResult.error,
      fieldResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(
        errors[0]?.message ||
          "Unable to load Training form.",
      );
    }

    const loadedEmployees =
      (employeeResult.data ?? []) as Employee[];

    const role = normaliseRole(
      roleResult.data?.role,
    );

    const self = loadedEmployees.find(
      (item) => item.user_id === user.id,
    );

    setCurrentRole(role);
    setSelfEmployeeId(self?.id ?? "");

    setEmployees(loadedEmployees);

    setProjects(
      (projectResult.data ?? []) as Project[],
    );

    setTypes(
      (typeResult.data ?? []) as TrainingType[],
    );

    setOptions(
      (optionResult.data ?? []) as TrainingOption[],
    );

    setCustomFields(
      (fieldResult.data ?? []) as CustomField[],
    );

    setEmployeeId((current) => {
      if (
        current &&
        loadedEmployees.some(
          (item) => item.id === current,
        )
      ) {
        return current;
      }

      if (self?.id) {
        return self.id;
      }

      if (canManageOtherEmployees(role)) {
        return loadedEmployees[0]?.id ?? "";
      }

      return "";
    });
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      try {
        await loadReferenceData();
      } catch (error) {
        setMessage({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Unable to load Training form.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [loadReferenceData]);

  /* =======================================================
     Derived state
     ======================================================= */

  const selectedEmployee =
    employees.find(
      (item) => item.id === employeeId,
    ) ?? null;

  const selectedType =
    types.find(
      (item) => item.id === trainingTypeId,
    ) ?? null;

  const canChooseEmployee =
    canManageOtherEmployees(currentRole);

  /**
   * SEARCHABLE EMPLOYEE SELECTOR
   *
   * This replaces the old huge employee dropdown.
   */
  const filteredEmployees = useMemo(() => {
    const query =
      employeeSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return employees
      .filter((employee) =>
        [
          employee.full_name,
          employee.payroll_id,
          employee.role,
        ]
          .map(clean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 12);
  }, [employeeSearch, employees]);

  const typeOptions = useMemo(
    () =>
      options.filter(
        (item) =>
          item.training_type_id ===
          trainingTypeId,
      ),
    [options, trainingTypeId],
  );

  const typeFields = useMemo(
    () =>
      customFields.filter(
        (item) =>
          item.training_type_id ===
          trainingTypeId,
      ),
    [customFields, trainingTypeId],
  );

  const selectedOptions =
    typeOptions.filter((option) =>
      selectedOptionIds.includes(
        option.id,
      ),
    );

  /* =======================================================
     Reset type-specific fields
     ======================================================= */

  useEffect(() => {
    setSelectedOptionIds([]);
    setMetadata({});
    setProjectId("");
    setIssuer("");
    setCertificateNumber("");
    setIssueDate("");
    setExpiryDate("");
    setNotes("");

    setSingleFile(null);
    setFrontFile(null);
    setBackFile(null);

    setFlexibleEvidenceMode("single");

    setExistingRecords([]);

    setReplaceChoice(null);
    setReplaceRecordId("");
  }, [trainingTypeId]);

  /* =======================================================
     Automatic expiry
     ======================================================= */

  useEffect(() => {
    if (!selectedType) {
      return;
    }

    if (
      selectedType.validity_mode ===
      "never"
    ) {
      setExpiryDate("");
      return;
    }

    if (
      selectedType.validity_mode ===
        "automatic" &&
      issueDate
    ) {
      setExpiryDate(
        addInterval(
          issueDate,
          selectedType.validity_interval_value,
          selectedType.validity_interval_unit,
        ),
      );
    }
  }, [issueDate, selectedType]);

  /* =======================================================
     Existing current records / replacement
     ======================================================= */

  useEffect(() => {
    if (
      !employeeId ||
      !trainingTypeId
    ) {
      setExistingRecords([]);
      return;
    }

    void (async () => {
      const {
        data,
        error,
      } = await supabase
        .from(
          "employee_training_records",
        )
        .select(
          "id,employee_id,training_type_id,certificate_number,option_codes,class_codes,issue_date,expiry_date,workflow_status,current_version,superseded_at,revoked_at",
        )
        .eq(
          "employee_id",
          employeeId,
        )
        .eq(
          "training_type_id",
          trainingTypeId,
        )
        .eq(
          "current_version",
          true,
        )
        .is(
          "superseded_at",
          null,
        )
        .is(
          "revoked_at",
          null,
        )
        .order(
          "created_at",
          {
            ascending: false,
          },
        );

      if (error) {
        console.warn(
          "Existing Training records could not be loaded",
          error,
        );

        setExistingRecords([]);
        return;
      }

      const rows =
        (
          (data ?? []) as ExistingRecord[]
        ).filter(
          (record) =>
            clean(
              record.workflow_status,
            ) === "approved",
        );

      setExistingRecords(rows);

      if (rows.length === 0) {
        setReplaceChoice(null);
        setReplaceRecordId("");
        return;
      }

      if (
        rows.length === 1 &&
        selectedType?.allows_multiple_current ===
          false
      ) {
        setReplaceChoice("replace");
        setReplaceRecordId(
          rows[0].id,
        );
      }
    })();
  }, [
    employeeId,
    selectedType?.allows_multiple_current,
    supabase,
    trainingTypeId,
  ]);

  /* =======================================================
     Validation
     ======================================================= */

  function customFieldMissing(
    field: CustomField,
  ) {
    const value =
      metadata[field.field_key];

    return (
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) &&
        value.length === 0) ||
      (field.field_type ===
        "checkbox" &&
        value !== true)
    );
  }

  function validate() {
    if (!selectedEmployee) {
      return "Select the employee.";
    }

    if (!selectedType) {
      return "Select the Training Type.";
    }

    if (
      !canChooseEmployee &&
      selectedEmployee.id !==
        selfEmployeeId
    ) {
      return "You can only upload Training evidence for your own employee profile.";
    }

    if (
      selectedType.requires_project &&
      !projectId
    ) {
      return "Select the project.";
    }

    if (
      selectedType.requires_issuer &&
      !issuer.trim()
    ) {
      return "Enter the provider / issuing organisation.";
    }

    if (
      selectedType.requires_certificate_number &&
      !certificateNumber.trim()
    ) {
      return "Enter the certificate or licence number.";
    }

    if (
      selectedType.requires_issue_date &&
      !issueDate
    ) {
      return "Enter the issue date.";
    }

    if (
      selectedType.validity_mode !==
        "never" &&
      selectedType.requires_expiry_date &&
      !expiryDate
    ) {
      return "Enter the expiry date.";
    }

    for (const field of typeFields) {
      if (
        field.required &&
        customFieldMissing(field)
      ) {
        return `Enter ${field.label}.`;
      }
    }

    if (selectedType.requires_document) {
      if (
        selectedType.document_upload_type ===
        "front_back"
      ) {
        if (
          !frontFile ||
          !backFile
        ) {
          return "Upload both the front and back files.";
        }
      } else if (
        selectedType.document_upload_type ===
        "single_or_front_back"
      ) {
        if (
          flexibleEvidenceMode ===
          "front_back"
        ) {
          if (
            !frontFile ||
            !backFile
          ) {
            return "Upload both the front and back files.";
          }
        } else if (!singleFile) {
          return "Upload the complete certificate / licence evidence.";
        }
      } else if (!singleFile) {
        return "Upload the required certificate / licence evidence.";
      }
    }

    if (
      existingRecords.length > 0
    ) {
      if (!replaceChoice) {
        return "Choose whether this upload replaces a current record or is added as another current record.";
      }

      if (
        replaceChoice ===
          "replace" &&
        !replaceRecordId
      ) {
        return "Select the current record being replaced.";
      }

      if (
        replaceChoice === "add" &&
        selectedType.allows_multiple_current ===
          false
      ) {
        return "This Training Type does not allow multiple current records.";
      }
    }

    return null;
  }

  /* =======================================================
     Submit
     ======================================================= */

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setMessage(null);

    const validationError =
      validate();

    if (validationError) {
      setMessage({
        tone: "error",
        text: validationError,
      });

      return;
    }

    if (
      !selectedEmployee ||
      !selectedType
    ) {
      return;
    }

    setSubmitting(true);

    try {
      const form =
        new FormData();

      form.set(
        "employeeId",
        selectedEmployee.id,
      );

      form.set(
        "trainingTypeId",
        selectedType.id,
      );

      form.set(
        "projectId",
        projectId,
      );

      form.set(
        "issuer",
        issuer.trim(),
      );

      form.set(
        "certificateNumber",
        certificateNumber.trim(),
      );

      form.set(
        "issueDate",
        issueDate,
      );

      form.set(
        "expiryDate",
        expiryDate,
      );

      form.set(
        "notes",
        notes.trim(),
      );

      form.set(
        "metadata",
        JSON.stringify(metadata),
      );

      form.set(
        "selectedOptionIds",
        JSON.stringify(
          selectedOptionIds,
        ),
      );

      form.set(
        "selectedOptionCodes",
        JSON.stringify(
          selectedOptions.map(
            (option) => option.code,
          ),
        ),
      );

      form.set(
        "documentUploadType",
        selectedType.document_upload_type ===
          "single_or_front_back"
          ? flexibleEvidenceMode
          : selectedType.document_upload_type ||
              "single",
      );

      form.set(
        "replacementMode",
        replaceChoice ?? "none",
      );

      form.set(
        "supersedesRecordId",
        replaceRecordId,
      );

      form.set(
        "source",
        selectedEmployee.id ===
          selfEmployeeId
          ? "employee_self_service"
          : "website_admin",
      );

      /**
       * Compress phone photos before creating the request.
       */
      const [
        preparedSingleFile,
        preparedFrontFile,
        preparedBackFile,
      ] = await Promise.all([
        singleFile
          ? prepareTrainingUploadFile(
              singleFile,
            )
          : null,

        frontFile
          ? prepareTrainingUploadFile(
              frontFile,
            )
          : null,

        backFile
          ? prepareTrainingUploadFile(
              backFile,
            )
          : null,
      ]);

      const preparedFiles = [
        preparedSingleFile,
        preparedFrontFile,
        preparedBackFile,
      ].filter(
        (item): item is File =>
          Boolean(item),
      );

      const requestFileBytes =
        preparedFiles.reduce(
          (total, item) =>
            total + item.size,
          0,
        );

      if (
        requestFileBytes >
        TRAINING_REQUEST_SAFE_BYTES
      ) {
        throw new Error(
          `The selected evidence is still ${(
            requestFileBytes /
            1024 /
            1024
          ).toFixed(
            1,
          )} MB after photo compression. Use a smaller PDF or split the evidence before uploading.`,
        );
      }

      if (preparedSingleFile) {
        form.set(
          "file",
          preparedSingleFile,
        );
      }

      if (preparedFrontFile) {
        form.set(
          "frontFile",
          preparedFrontFile,
        );
      }

      if (preparedBackFile) {
        form.set(
          "backFile",
          preparedBackFile,
        );
      }

      const response =
        await apiFetch(
          "/api/training/records/upload",
          {
            method: "POST",
            body: form,
          },
        );

      /**
       * Do NOT blindly call response.json().
       * Deployment/platform errors can return plain text or HTML.
       */
      const responseText =
        await response.text();

      let result: {
        error?: string;
        workflowStatus?: string;
        notificationWarning?:
          | string
          | null;
      } | null = null;

      if (responseText) {
        try {
          result = JSON.parse(
            responseText,
          ) as {
            error?: string;
            workflowStatus?: string;
            notificationWarning?:
              | string
              | null;
          };
        } catch {
          result = null;
        }
      }

      if (!response.ok) {
        const serverMessage =
          clean(result?.error);

        const rawMessage =
          clean(responseText);

        console.error(
          "Training upload failed",
          {
            status:
              response.status,

            statusText:
              response.statusText,

            response:
              rawMessage,
          },
        );

        throw new Error(
          serverMessage ||
            (
              rawMessage &&
              !rawMessage.startsWith(
                "<",
              )
                ? `Upload failed (${response.status}): ${rawMessage.slice(
                    0,
                    500,
                  )}`
                : `Upload failed (${response.status} ${response.statusText}). The upload API did not return a valid TTTracker error response.`
            ),
        );
      }

      const successText =
        result?.workflowStatus ===
        "approved"
          ? "Training record approved automatically and published to SharePoint."
          : "Training record submitted. The document will be published to SharePoint after approval.";

      setMessage({
        tone:
          result?.notificationWarning
            ? "error"
            : "success",

        text:
          result?.notificationWarning
            ? `${successText} ${result.notificationWarning}`
            : successText,
      });

      /**
       * Keep selected employee so repetitive Admin uploads
       * for one employee are quicker.
       */
      setTrainingTypeId("");
      setSelectedOptionIds([]);
      setProjectId("");
      setIssuer("");
      setCertificateNumber("");
      setIssueDate("");
      setExpiryDate("");
      setNotes("");
      setMetadata({});

      setSingleFile(null);
      setFrontFile(null);
      setBackFile(null);

      setExistingRecords([]);

      setReplaceChoice(null);
      setReplaceRecordId("");
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The Training record could not be uploaded.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  /* =======================================================
     Loading
     ======================================================= */

  if (loading) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2
            size={30}
            className="animate-spin text-slate-400"
          />
        </div>
      </AppShell>
    );
  }

  /* =======================================================
     UI
     ======================================================= */

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <Link
            href="/people/training"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft size={16} />
            Back to Training
          </Link>
        </div>

        {/* Header */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                <UploadCloud size={17} />
                Training records
              </div>

              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                Upload Training Record
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                Employees can upload their own evidence. Admin/HSEQ
                can search for an employee and upload on their behalf.
                Type-specific rules and required fields come from
                Training Configuration.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/people/training"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                Training Register
              </Link>

              {canChooseEmployee ? (
                <Link
                  href="/people/training/bulk-upload"
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
                >
                  Bulk Upload
                </Link>
              ) : null}

              <button
                type="button"
                onClick={() =>
                  void loadReferenceData()
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
          </div>
        </section>

        {/* Message */}
        {message ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
              message.tone ===
              "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            <div className="flex items-start gap-2">
              {message.tone ===
              "success" ? (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              ) : (
                <AlertTriangle
                  size={18}
                  className="mt-0.5 shrink-0"
                />
              )}

              {message.text}
            </div>
          </section>
        ) : null}

        {/* Missing linked employee */}
        {!selfEmployeeId &&
        !canChooseEmployee ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <div className="flex items-start gap-3">
              <UserRound
                size={22}
                className="mt-0.5"
              />

              <div>
                <div className="font-black">
                  No employee profile is linked to your login
                </div>

                <div className="mt-1 text-sm font-semibold leading-6">
                  Ask an administrator to link your TTTracker login
                  to your existing employee profile before using
                  self-service Training upload.
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <form
          onSubmit={submit}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
        >
          <section className="space-y-6">
            {/* =================================================
                Employee
                ================================================= */}

            <Card
              title="1. Employee"
              description={
                canChooseEmployee
                  ? "Search and select the employee."
                  : "Your linked employee profile is used automatically."
              }
            >
              {canChooseEmployee ? (
                <div className="space-y-3">
                  <Field
                    label="Employee"
                    required
                  >
                    <div className="relative">
                      <Search
                        size={18}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        className={`${inputClass} pl-10`}
                        value={
                          employeeSearch
                        }
                        onChange={(event) =>
                          setEmployeeSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Search employee name, payroll ID or role..."
                        autoComplete="off"
                      />
                    </div>
                  </Field>

                  {/* Search results */}
                  {employeeSearch.trim() ? (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      {filteredEmployees.length >
                      0 ? (
                        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                          {filteredEmployees.map(
                            (employee) => (
                              <button
                                key={employee.id}
                                type="button"
                                onClick={() => {
                                  setEmployeeId(
                                    employee.id,
                                  );

                                  setEmployeeSearch(
                                    "",
                                  );
                                }}
                                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-black text-slate-950">
                                    {
                                      employee.full_name
                                    }
                                  </div>

                                  <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                    {[
                                      employee.payroll_id,
                                      employee.role,
                                    ]
                                      .filter(
                                        Boolean,
                                      )
                                      .join(
                                        " · ",
                                      ) ||
                                      "No payroll ID"}
                                  </div>
                                </div>

                                {employee.id ===
                                employeeId ? (
                                  <CheckCircle2
                                    size={18}
                                    className="shrink-0 text-emerald-600"
                                  />
                                ) : null}
                              </button>
                            ),
                          )}
                        </div>
                      ) : (
                        <div className="px-4 py-4 text-sm font-semibold text-slate-500">
                          No employees match that search.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Selected employee */}
                  {selectedEmployee ? (
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.12em] text-blue-500">
                          Selected employee
                        </div>

                        <div className="mt-1 truncate font-black text-slate-950">
                          {
                            selectedEmployee.full_name
                          }
                        </div>

                        <div className="mt-1 truncate text-sm font-semibold text-slate-600">
                          {[
                            selectedEmployee.payroll_id,
                            selectedEmployee.role,
                          ]
                            .filter(Boolean)
                            .join(" · ") ||
                            "No payroll ID"}
                        </div>
                      </div>

                      <CheckCircle2
                        size={22}
                        className="shrink-0 text-blue-700"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                      Search for and select an employee.
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="font-black text-slate-950">
                    {selectedEmployee?.full_name ||
                      "No linked employee"}
                  </div>

                  <div className="mt-1 text-sm font-semibold text-slate-500">
                    {selectedEmployee?.payroll_id ||
                      "No Payroll ID"}
                  </div>
                </div>
              )}
            </Card>

            {/* =================================================
                Training type
                ================================================= */}

            <Card
              title="2. Training Type"
              description="The selected type controls the fields, expiry logic and document requirements."
            >
              <Field
                label="Training Type"
                required
              >
                <select
                  className={
                    inputClass
                  }
                  value={
                    trainingTypeId
                  }
                  onChange={(event) =>
                    setTrainingTypeId(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select...
                  </option>

                  {types.map((type) => (
                    <option
                      key={type.id}
                      value={type.id}
                    >
                      {type.name}
                      {type.short_code
                        ? ` (${type.short_code})`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>

              {/* Classes / endorsements */}
              {typeOptions.length >
              0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-sm font-black text-slate-800">
                    Classes / endorsements
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {typeOptions.map(
                      (option) => {
                        const checked =
                          selectedOptionIds.includes(
                            option.id,
                          );

                        const single =
                          selectedType?.subtype_mode ===
                          "single";

                        return (
                          <label
                            key={
                              option.id
                            }
                            className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${
                              checked
                                ? "border-blue-300 bg-blue-50 text-blue-800"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <input
                              type={
                                single
                                  ? "radio"
                                  : "checkbox"
                              }
                              name={
                                single
                                  ? "training-option"
                                  : undefined
                              }
                              className="mr-2"
                              checked={
                                checked
                              }
                              onChange={() => {
                                setSelectedOptionIds(
                                  (
                                    current,
                                  ) => {
                                    if (
                                      single
                                    ) {
                                      return [
                                        option.id,
                                      ];
                                    }

                                    return checked
                                      ? current.filter(
                                          (
                                            id,
                                          ) =>
                                            id !==
                                            option.id,
                                        )
                                      : [
                                          ...current,
                                          option.id,
                                        ];
                                  },
                                );
                              }}
                            />

                            {option.code ||
                              option.name}
                          </label>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : null}
            </Card>

            {/* =================================================
                Record details
                ================================================= */}

            {selectedType ? (
              <Card
                title="3. Record Details"
                description="Only the fields enabled by this Training Type are shown."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedType.requires_project ? (
                    <Field
                      label="Project"
                      required
                    >
                      <select
                        className={
                          inputClass
                        }
                        value={
                          projectId
                        }
                        onChange={(event) =>
                          setProjectId(
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          Select...
                        </option>

                        {projects.map(
                          (project) => (
                            <option
                              key={
                                project.id
                              }
                              value={
                                project.id
                              }
                            >
                              {project.project_number
                                ? `${project.project_number} - `
                                : ""}
                              {
                                project.name
                              }
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                  ) : null}

                  {selectedType.requires_issuer ? (
                    <Field
                      label="Provider / Issuer"
                      required
                    >
                      <input
                        className={
                          inputClass
                        }
                        value={
                          issuer
                        }
                        onChange={(event) =>
                          setIssuer(
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  ) : null}

                  {selectedType.requires_certificate_number ? (
                    <Field
                      label="Certificate / Licence Number"
                      required
                    >
                      <input
                        className={
                          inputClass
                        }
                        value={
                          certificateNumber
                        }
                        onChange={(event) =>
                          setCertificateNumber(
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  ) : null}

                  {selectedType.requires_issue_date ||
                  selectedType.validity_mode ===
                    "automatic" ? (
                    <Field
                      label="Issue Date"
                      required
                    >
                      <input
                        type="date"
                        className={
                          inputClass
                        }
                        value={
                          issueDate
                        }
                        onChange={(event) =>
                          setIssueDate(
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  ) : null}

                  {selectedType.validity_mode !==
                    "never" &&
                  selectedType.requires_expiry_date ? (
                    <Field
                      label="Expiry Date"
                      required
                    >
                      <input
                        type="date"
                        className={
                          inputClass
                        }
                        value={
                          expiryDate
                        }
                        readOnly={
                          selectedType.validity_mode ===
                          "automatic"
                        }
                        onChange={(event) =>
                          setExpiryDate(
                            event.target.value,
                          )
                        }
                      />
                    </Field>
                  ) : null}
                </div>

                {/* Configurable custom fields */}
                {typeFields.length >
                0 ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {typeFields.map(
                      (field) => (
                        <DynamicField
                          key={field.id}
                          field={field}
                          value={
                            metadata[
                              field.field_key
                            ]
                          }
                          onChange={(value) =>
                            setMetadata(
                              (
                                current,
                              ) => ({
                                ...current,
                                [field.field_key]:
                                  value,
                              }),
                            )
                          }
                        />
                      ),
                    )}
                  </div>
                ) : null}

                <div className="mt-4">
                  <Field label="Notes">
                    <textarea
                      className={`${inputClass} min-h-24`}
                      value={notes}
                      onChange={(event) =>
                        setNotes(
                          event.target.value,
                        )
                      }
                    />
                  </Field>
                </div>
              </Card>
            ) : null}

            {/* =================================================
                Evidence
                ================================================= */}

            {selectedType?.requires_document ? (
              <Card
                title="4. Evidence"
                description="Upload the certificate, licence or card evidence required by this Training Type."
              >
                {selectedType.document_upload_type ===
                "single_or_front_back" ? (
                  <>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFlexibleEvidenceMode(
                            "single",
                          );

                          setFrontFile(
                            null,
                          );

                          setBackFile(
                            null,
                          );
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          flexibleEvidenceMode ===
                          "single"
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-black text-slate-900">
                          Single document
                        </div>

                        <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Use for a Statement of Attainment,
                          certificate or complete multi-page PDF.
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFlexibleEvidenceMode(
                            "front_back",
                          );

                          setSingleFile(
                            null,
                          );
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          flexibleEvidenceMode ===
                          "front_back"
                            ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-black text-slate-900">
                          Front + Back
                        </div>

                        <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                          Use for a two-sided licence, ticket or
                          card such as a Gold Card.
                        </div>
                      </button>
                    </div>

                    {flexibleEvidenceMode ===
                    "front_back" ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field
                          label="Front"
                          required
                        >
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className={
                              fileInputClass
                            }
                            onChange={(event) =>
                              setFrontFile(
                                event.target.files?.[0] ??
                                  null,
                              )
                            }
                          />
                        </Field>

                        <Field
                          label="Back"
                          required
                        >
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className={
                              fileInputClass
                            }
                            onChange={(event) =>
                              setBackFile(
                                event.target.files?.[0] ??
                                  null,
                              )
                            }
                          />
                        </Field>
                      </div>
                    ) : (
                      <Field
                        label="Certificate / Licence / Evidence"
                        required
                      >
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className={
                            fileInputClass
                          }
                          onChange={(event) =>
                            setSingleFile(
                              event.target.files?.[0] ??
                                null,
                            )
                          }
                        />
                      </Field>
                    )}
                  </>
                ) : selectedType.document_upload_type ===
                  "front_back" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      label="Front"
                      required
                    >
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className={
                          fileInputClass
                        }
                        onChange={(event) =>
                          setFrontFile(
                            event.target.files?.[0] ??
                              null,
                          )
                        }
                      />
                    </Field>

                    <Field
                      label="Back"
                      required
                    >
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className={
                          fileInputClass
                        }
                        onChange={(event) =>
                          setBackFile(
                            event.target.files?.[0] ??
                              null,
                          )
                        }
                      />
                    </Field>
                  </div>
                ) : (
                  <Field
                    label="Certificate / Licence / Evidence"
                    required
                  >
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className={
                        fileInputClass
                      }
                      onChange={(event) =>
                        setSingleFile(
                          event.target.files?.[0] ??
                            null,
                        )
                      }
                    />
                  </Field>
                )}

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
                  Large phone photos are automatically resized and
                  compressed before upload. Final filenames are
                  generated server-side from the configured Training
                  filename rules.
                </div>
              </Card>
            ) : null}

            {/* =================================================
                Existing current record / replacement
                ================================================= */}

            {existingRecords.length >
            0 ? (
              <Card
                title="5. Existing Current Record"
                description="Choose the current record that this upload replaces. Once the new record is approved, the previous evidence is moved into the employee's Superseded folder."
              >
                <div className="space-y-3">
                  {existingRecords.map(
                    (record) => {
                      const codes =
                        record.option_codes
                          ?.length
                          ? record.option_codes
                          : record.class_codes ??
                            [];

                      return (
                        <label
                          key={record.id}
                          className={`block cursor-pointer rounded-xl border p-4 ${
                            replaceChoice ===
                              "replace" &&
                            replaceRecordId ===
                              record.id
                              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="replacement-record"
                              checked={
                                replaceChoice ===
                                  "replace" &&
                                replaceRecordId ===
                                  record.id
                              }
                              onChange={() => {
                                setReplaceChoice(
                                  "replace",
                                );

                                setReplaceRecordId(
                                  record.id,
                                );
                              }}
                              className="mt-1"
                            />

                            <div className="min-w-0">
                              <div className="font-black text-slate-900">
                                Replace this record
                                {codes.length
                                  ? ` — ${codes.join(", ")}`
                                  : ""}
                              </div>

                              <div className="mt-1 text-sm font-semibold text-slate-600">
                                Issue:{" "}
                                {formatDate(
                                  record.issue_date,
                                )}{" "}
                                · Expiry:{" "}
                                {formatDate(
                                  record.expiry_date,
                                )}
                              </div>

                              {record.certificate_number ? (
                                <div className="mt-1 text-xs font-semibold text-slate-500">
                                  Number:{" "}
                                  {
                                    record.certificate_number
                                  }
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </label>
                      );
                    },
                  )}

                  {selectedType?.allows_multiple_current ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
                      <input
                        type="radio"
                        name="replacement-record"
                        checked={
                          replaceChoice ===
                          "add"
                        }
                        onChange={() => {
                          setReplaceChoice(
                            "add",
                          );

                          setReplaceRecordId(
                            "",
                          );
                        }}
                        className="mt-1"
                      />

                      <div>
                        <div className="font-black text-slate-900">
                          Add another current record
                        </div>

                        <div className="mt-1 text-sm font-semibold text-slate-600">
                          Keep the existing approved record current
                          as well.
                        </div>
                      </div>
                    </label>
                  ) : null}
                </div>
              </Card>
            ) : null}
          </section>

          {/* =================================================
              Summary sidebar
              ================================================= */}

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card title="Submission Summary">
              <SummaryRow
                label="Employee"
                value={
                  selectedEmployee
                    ? `${
                        selectedEmployee.payroll_id ||
                        "No Payroll ID"
                      } — ${selectedEmployee.full_name}`
                    : "Not selected"
                }
              />

              <SummaryRow
                label="Training"
                value={
                  selectedType
                    ? `${selectedType.name}${
                        selectedType.short_code
                          ? ` (${selectedType.short_code})`
                          : ""
                      }`
                    : "Not selected"
                }
              />

              <SummaryRow
                label="Classes"
                value={
                  selectedOptions.length
                    ? selectedOptions
                        .map(
                          (item) =>
                            item.code,
                        )
                        .join(", ")
                    : "None"
                }
              />

              <SummaryRow
                label="Issue"
                value={
                  issueDate
                    ? formatDate(
                        issueDate,
                      )
                    : "Not set"
                }
              />

              <SummaryRow
                label="Expiry"
                value={
                  selectedType?.validity_mode ===
                  "never"
                    ? "Does not expire"
                    : expiryDate
                      ? formatDate(
                          expiryDate,
                        )
                      : "Not set"
                }
              />

              <SummaryRow
                label="Review"
                value={
                  selectedType?.requires_review ===
                  false
                    ? "Auto-approved"
                    : "Reviewer approval required"
                }
              />

              {existingRecords.length >
                0 &&
              replaceChoice ===
                "replace" ? (
                <SummaryRow
                  label="Replacement"
                  value="Supersede current record"
                />
              ) : null}
            </Card>

            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900">
              <div className="flex items-start gap-2">
                <ShieldCheck
                  size={18}
                  className="mt-0.5 shrink-0"
                />

                <div>
                  Evidence requiring review is not published to
                  SharePoint until a configured reviewer approves
                  it.
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                !selectedEmployee ||
                !selectedType
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <UploadCloud
                  size={18}
                />
              )}

              {submitting
                ? "Submitting..."
                : "Submit Training Record"}
            </button>
          </aside>
        </form>
      </main>
    </AppShell>
  );
}

/* =========================================================
   Shared form styles
   ========================================================= */

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const fileInputClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-black file:text-slate-700";

/* =========================================================
   UI helpers
   ========================================================= */

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-black text-slate-950">
          {title}
        </h2>

        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-slate-800">
        {label}

        {required ? (
          <span className="ml-1 text-rose-600">
            *
          </span>
        ) : null}
      </span>

      {children}
    </label>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0">
      <span className="text-sm font-semibold text-slate-500">
        {label}
      </span>

      <span className="max-w-[62%] text-right text-sm font-black text-slate-900">
        {value}
      </span>
    </div>
  );
}

/* =========================================================
   Dynamic configurable Training fields
   ========================================================= */

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options =
    fieldOptions(field.options);

  if (
    field.field_type ===
    "checkbox"
  ) {
    return (
      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) =>
            onChange(
              event.target.checked,
            )
          }
          className="h-5 w-5 rounded border-slate-300"
        />

        <span className="text-sm font-black text-slate-800">
          {field.label}

          {field.required ? (
            <span className="ml-1 text-rose-600">
              *
            </span>
          ) : null}
        </span>
      </label>
    );
  }

  if (
    field.field_type ===
    "select"
  ) {
    return (
      <Field
        label={field.label}
        required={field.required}
      >
        <select
          className={inputClass}
          value={clean(value)}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
        >
          <option value="">
            Select...
          </option>

          {options.map(
            (option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ),
          )}
        </select>

        {field.help_text ? (
          <p className="mt-1.5 text-xs font-semibold text-slate-500">
            {field.help_text}
          </p>
        ) : null}
      </Field>
    );
  }

  if (
    field.field_type ===
    "multiselect"
  ) {
    const selected =
      Array.isArray(value)
        ? value.map(String)
        : [];

    return (
      <div>
        <div className="mb-2 text-sm font-black text-slate-800">
          {field.label}

          {field.required ? (
            <span className="ml-1 text-rose-600">
              *
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {options.map(
            (option) => {
              const checked =
                selected.includes(
                  option,
                );

              return (
                <label
                  key={option}
                  className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-bold ${
                    checked
                      ? "border-blue-300 bg-blue-50 text-blue-800"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={checked}
                    onChange={() =>
                      onChange(
                        checked
                          ? selected.filter(
                              (item) =>
                                item !==
                                option,
                            )
                          : [
                              ...selected,
                              option,
                            ],
                      )
                    }
                  />

                  {option}
                </label>
              );
            },
          )}
        </div>

        {field.help_text ? (
          <p className="mt-1.5 text-xs font-semibold text-slate-500">
            {field.help_text}
          </p>
        ) : null}
      </div>
    );
  }

  if (
    field.field_type ===
    "textarea"
  ) {
    return (
      <Field
        label={field.label}
        required={field.required}
      >
        <textarea
          className={`${inputClass} min-h-24`}
          placeholder={
            field.placeholder ?? ""
          }
          value={clean(value)}
          onChange={(event) =>
            onChange(
              event.target.value,
            )
          }
        />

        {field.help_text ? (
          <p className="mt-1.5 text-xs font-semibold text-slate-500">
            {field.help_text}
          </p>
        ) : null}
      </Field>
    );
  }

  const type =
    field.field_type ===
    "number"
      ? "number"
      : field.field_type ===
          "date"
        ? "date"
        : "text";

  return (
    <Field
      label={field.label}
      required={field.required}
    >
      <input
        type={type}
        className={inputClass}
        placeholder={
          field.placeholder ?? ""
        }
        value={clean(value)}
        onChange={(event) => {
          if (
            field.field_type ===
            "number"
          ) {
            onChange(
              event.target.value ===
                ""
                ? ""
                : Number(
                    event.target.value,
                  ),
            );

            return;
          }

          onChange(
            event.target.value,
          );
        }}
      />

      {field.help_text ? (
        <p className="mt-1.5 text-xs font-semibold text-slate-500">
          {field.help_text}
        </p>
      ) : null}
    </Field>
  );
}