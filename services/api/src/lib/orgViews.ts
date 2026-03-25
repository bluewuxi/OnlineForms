import { type Course } from "./courses";
import { type FormSchema } from "./formSchemas";
import { type Submission } from "./submissions";

export type OrgEnrollmentStatus = "upcoming" | "open" | "closed";

export type OrgCourseWorkflow = {
  enrollmentStatus: OrgEnrollmentStatus;
  hasActiveForm: boolean;
  publishReady: boolean;
};

export type OrgCourseView = Course & {
  workflow: OrgCourseWorkflow;
};

export type OrgFormSchemaSummary = {
  fieldCount: number;
  requiredFieldCount: number;
  fieldTypes: string[];
};

export type OrgFormSchemaView = FormSchema & {
  summary: OrgFormSchemaSummary;
};

export type OrgSubmissionWorkflow = {
  canReview: boolean;
  isTerminal: boolean;
};

export type OrgSubmissionView = Submission & {
  workflow: OrgSubmissionWorkflow;
  course: {
    id: string;
    title: string | null;
  };
};

function toEnrollmentStatus(enrollmentOpenAt: string, enrollmentCloseAt: string): OrgEnrollmentStatus {
  const nowMs = Date.now();
  const openAtMs = Date.parse(enrollmentOpenAt);
  const closeAtMs = Date.parse(enrollmentCloseAt);

  if (!Number.isFinite(openAtMs) || !Number.isFinite(closeAtMs)) {
    return "closed";
  }
  if (nowMs < openAtMs) {
    return "upcoming";
  }
  if (nowMs > closeAtMs) {
    return "closed";
  }
  return "open";
}

export function toOrgCourseView(course: Course): OrgCourseView {
  const hasActiveForm = Boolean(course.activeFormId) && Number.isInteger(course.activeFormVersion);
  return {
    ...course,
    workflow: {
      enrollmentStatus: toEnrollmentStatus(course.enrollmentOpenAt, course.enrollmentCloseAt),
      hasActiveForm,
      publishReady:
        course.status === "draft" &&
        hasActiveForm &&
        course.pricingMode === "free" &&
        course.paymentEnabledFlag === false
    }
  };
}

export function toOrgFormSchemaView(schema: FormSchema): OrgFormSchemaView {
  return {
    ...schema,
    summary: summarizeFormFields(schema.fields)
  };
}

export function summarizeFormFields(fields: FormSchema["fields"]): OrgFormSchemaSummary {
  const fieldTypes = Array.from(new Set(fields.map((field) => field.type))).sort();
  return {
    fieldCount: fields.length,
    requiredFieldCount: fields.filter((field) => field.required).length,
    fieldTypes
  };
}

export function toOrgSubmissionView(
  submission: Submission,
  options?: {
    courseTitle?: string | null;
  }
): OrgSubmissionView {
  return {
    ...submission,
    workflow: {
      canReview: submission.status === "submitted",
      isTerminal: submission.status !== "submitted"
    },
    course: {
      id: submission.course?.id ?? submission.courseId,
      title: options?.courseTitle ?? submission.course?.title ?? null
    }
  };
}
