import { createHash, randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getPublicCourseDetail, resolveTenantIdByCode } from "./courses";
import { ApiError } from "./errors";
import { type FormField, getCourseFormSchemaVersion } from "./formSchemas";

type EnrollmentMeta = {
  locale?: string | null;
  timezone?: string | null;
};

export type CreateEnrollmentInput = {
  formVersion: number;
  answers: Record<string, unknown>;
  meta?: EnrollmentMeta;
};

export type EnrollmentCreateResult = {
  submissionId: string;
  status: "submitted";
  submittedAt: string;
};

type IdempotencyRecord = {
  requestHash?: string;
  responseSnapshot?: EnrollmentCreateResult;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function submissionSk(submissionId: string): string {
  return `SUBMISSION#${submissionId}`;
}

function idempotencySk(idempotencyKey: string): string {
  return `IDEMP#${idempotencyKey}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeIdempotencyKey(idempotencyKey: string): string {
  const key = idempotencyKey.trim().toLowerCase();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (!uuidPattern.test(key)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key must be a valid UUID.");
  }
  return key;
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(payload: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(payload)).digest("hex")}`;
}

function validateText(field: FormField, value: string, issues: Array<{ field?: string; issue: string }>): void {
  const minLength = field.validation?.minLength;
  const maxLength = field.validation?.maxLength;
  const pattern = field.validation?.pattern;
  if (typeof minLength === "number" && value.length < minLength) {
    issues.push({ field: field.fieldId, issue: `minLength:${minLength}` });
  }
  if (typeof maxLength === "number" && value.length > maxLength) {
    issues.push({ field: field.fieldId, issue: `maxLength:${maxLength}` });
  }
  if (typeof pattern === "string" && pattern.length > 0) {
    try {
      if (!new RegExp(pattern).test(value)) {
        issues.push({ field: field.fieldId, issue: "pattern" });
      }
    } catch {
      issues.push({ field: field.fieldId, issue: "pattern_invalid" });
    }
  }
}

function validateAnswersAgainstSchema(
  fields: FormField[],
  answers: Record<string, unknown>
): Array<{ field?: string; issue: string }> {
  const issues: Array<{ field?: string; issue: string }> = [];
  const fieldMap = new Map(fields.map((field) => [field.fieldId, field]));

  for (const key of Object.keys(answers)) {
    if (!fieldMap.has(key)) {
      issues.push({ field: key, issue: "unknown_field" });
    }
  }

  for (const field of fields) {
    const value = answers[field.fieldId];
    const missing =
      value === undefined || value === null || (typeof value === "string" && value.trim() === "") || value === "";

    if (field.required && missing) {
      issues.push({ field: field.fieldId, issue: "required" });
      continue;
    }
    if (missing) continue;

    switch (field.type) {
      case "short_text":
      case "long_text": {
        if (typeof value !== "string") {
          issues.push({ field: field.fieldId, issue: "must_be_string" });
          break;
        }
        validateText(field, value, issues);
        break;
      }
      case "email": {
        if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          issues.push({ field: field.fieldId, issue: "invalid_email" });
        }
        break;
      }
      case "phone": {
        if (typeof value !== "string" || !/^\+?[0-9()\-\s]{6,24}$/.test(value)) {
          issues.push({ field: field.fieldId, issue: "invalid_phone" });
        }
        break;
      }
      case "number": {
        if (typeof value !== "number" || Number.isNaN(value)) {
          issues.push({ field: field.fieldId, issue: "must_be_number" });
          break;
        }
        const min = field.validation?.min;
        const max = field.validation?.max;
        if (typeof min === "number" && value < min) issues.push({ field: field.fieldId, issue: `min:${min}` });
        if (typeof max === "number" && value > max) issues.push({ field: field.fieldId, issue: `max:${max}` });
        break;
      }
      case "single_select": {
        const options = (field.options ?? []).map((o) => o.value);
        if (typeof value !== "string" || !options.includes(value)) {
          issues.push({ field: field.fieldId, issue: "invalid_option" });
        }
        break;
      }
      case "multi_select": {
        const options = new Set((field.options ?? []).map((o) => o.value));
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || !options.has(v))) {
          issues.push({ field: field.fieldId, issue: "invalid_options" });
        }
        break;
      }
      case "checkbox": {
        if (typeof value !== "boolean") {
          issues.push({ field: field.fieldId, issue: "must_be_boolean" });
        }
        break;
      }
      case "date": {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          issues.push({ field: field.fieldId, issue: "invalid_date" });
        }
        break;
      }
      default:
        issues.push({ field: field.fieldId, issue: "unsupported_field_type" });
    }
  }

  return issues;
}

function validateCreateEnrollmentInput(input: CreateEnrollmentInput): void {
  if (!Number.isInteger(input.formVersion) || input.formVersion < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", "formVersion must be a positive integer.");
  }
  if (!isPlainObject(input.answers)) {
    throw new ApiError(400, "VALIDATION_ERROR", "answers must be a JSON object.");
  }
}

export async function createPublicEnrollment(
  tenantCode: string,
  courseId: string,
  idempotencyKeyRaw: string,
  input: CreateEnrollmentInput
): Promise<EnrollmentCreateResult> {
  validateCreateEnrollmentInput(input);
  const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyRaw);
  const tenantId = await resolveTenantIdByCode(tenantCode);
  const publicCourse = await getPublicCourseDetail(tenantCode, courseId);
  if (!publicCourse.enrollmentOpenNow) {
    throw new ApiError(409, "CONFLICT", "Enrollment window is closed.");
  }

  const schema = await getCourseFormSchemaVersion(tenantId, courseId, input.formVersion);
  const issues = validateAnswersAgainstSchema(schema.fields, input.answers);
  if (issues.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "One or more answers are invalid.", issues);
  }

  const requestHash = hashRequest({
    tenantCode: tenantCode.trim().toLowerCase(),
    courseId,
    formVersion: input.formVersion,
    answers: input.answers,
    meta: input.meta ?? null
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const submissionId = `sub_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const snapshot: EnrollmentCreateResult = {
    submissionId,
    status: "submitted",
    submittedAt: nowIso
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: tenantPk(tenantId),
          SK: idempotencySk(idempotencyKey),
          entityType: "IDEMPOTENCY",
          tenantId,
          idempotencyKey,
          requestHash,
          submissionId,
          responseSnapshot: snapshot,
          createdAt: nowIso,
          ttlEpoch: Math.floor(now.getTime() / 1000) + 24 * 60 * 60
        },
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      const existing = await ddb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: tenantPk(tenantId), SK: idempotencySk(idempotencyKey) }
        })
      );
      const existingItem = (existing.Item as IdempotencyRecord | undefined) ?? undefined;
      if (!existingItem?.responseSnapshot || !existingItem.requestHash) {
        throw new ApiError(409, "CONFLICT", "Idempotency key already used.");
      }
      if (existingItem.requestHash !== requestHash) {
        throw new ApiError(409, "CONFLICT", "Idempotency key was reused with a different request body.");
      }
      return existingItem.responseSnapshot;
    }
    throw error;
  }

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        PK: tenantPk(tenantId),
        SK: submissionSk(submissionId),
        entityType: "SUBMISSION",
        tenantId,
        tenantCode: tenantCode.trim().toLowerCase(),
        submissionId,
        courseId,
        formId: schema.formId,
        formVersion: schema.version,
        status: "submitted",
        applicant: {},
        answers: input.answers,
        meta: input.meta ?? null,
        submittedAt: nowIso,
        reviewedAt: null,
        reviewedBy: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        GSI1PK: `TENANT#${tenantId}#SUBMISSIONS`,
        GSI1SK: `SUBMITTED#${nowIso}#SUBMISSION#${submissionId}`,
        GSI3PK: `TENANT#${tenantId}#COURSE#${courseId}#SUBMISSIONS`,
        GSI3SK: `SUBMITTED#${nowIso}#SUBMISSION#${submissionId}`
      }
    })
  );

  return snapshot;
}
