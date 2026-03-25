import { createHash, randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { getPublicCourseDetail, resolveTenantIdByCode } from "./courses";
import { ApiError } from "./errors";
import { type FormField, getCourseFormSchemaVersion } from "./formSchemas";

type EnrollmentMeta = {
  locale?: string | null;
  timezone?: string | null;
};

export type SubmissionStatus = "submitted" | "reviewed" | "canceled";

export type Submission = {
  id: string;
  tenantId: string;
  tenantCode: string;
  courseId: string;
  formId: string;
  formVersion: number;
  status: SubmissionStatus;
  applicant: Record<string, unknown>;
  answers: Record<string, unknown>;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt?: string;
  applicantSummary?: {
    email: string | null;
    name: string | null;
  };
  course?: {
    id: string;
    title?: string | null;
  };
};

export type ListSubmissionsInput = {
  courseId?: string;
  status?: SubmissionStatus;
  submittedFrom?: string;
  submittedTo?: string;
  limit?: number;
  cursor?: string;
};

export type ListSubmissionsResult = {
  data: Submission[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
};

export type UpdateSubmissionStatusInput = {
  status: SubmissionStatus;
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
  tenantCode: string;
  courseId: string;
  courseTitle: string;
  links: {
    tenantHome: string;
    course: string;
  };
};

type IdempotencyRecord = {
  requestHash?: string;
  responseSnapshot?: EnrollmentCreateResult;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
let testCreatePublicEnrollmentOverride:
  | ((
      tenantCode: string,
      courseId: string,
      idempotencyKeyRaw: string,
      input: CreateEnrollmentInput
    ) => Promise<EnrollmentCreateResult>)
  | null = null;
let testListOrgSubmissionsOverride:
  | ((tenantId: string, input: ListSubmissionsInput) => Promise<ListSubmissionsResult>)
  | null = null;
let testGetOrgSubmissionOverride:
  | ((tenantId: string, submissionId: string) => Promise<Submission>)
  | null = null;
let testDdbSendOverride:
  | ((command: object) => Promise<Record<string, unknown>>)
  | null = null;

async function sendDdb(command: object): Promise<Record<string, unknown>> {
  if (testDdbSendOverride) {
    return testDdbSendOverride(command);
  }
  return (await ddb.send(command as never)) as Record<string, unknown>;
}

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function parseIsoDateTime(value: string, field: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid ISO date-time.`);
  }
  return date.toISOString();
}

function parseLimit(limitRaw: number | undefined): number {
  if (limitRaw === undefined) return 20;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  return limitRaw;
}

function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const text = Buffer.from(cursor, "base64").toString("utf-8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "cursor is invalid.");
  }
}

function encodeCursor(lastEvaluatedKey: Record<string, unknown> | undefined): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), "utf-8").toString("base64");
}

function decodeOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = decodeCursor(cursor);
  const offset = decoded.offset;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "cursor is invalid.");
  }
  return offset;
}

function encodeOffsetCursor(offset: number | null): string | null {
  if (offset === null) return null;
  return Buffer.from(JSON.stringify({ offset }), "utf-8").toString("base64");
}

function submissionFromItem(item: Record<string, unknown>): Submission {
  const applicant = (item.applicant as Record<string, unknown>) ?? {};
  const emailValue = applicant.email;
  const firstNameValue = applicant.firstName ?? applicant.first_name;
  const lastNameValue = applicant.lastName ?? applicant.last_name;
  const explicitNameValue = applicant.name;
  const fullName =
    (typeof explicitNameValue === "string" && explicitNameValue.trim().length > 0
      ? explicitNameValue.trim()
      : [firstNameValue, lastNameValue]
          .filter((v) => typeof v === "string" && v.trim().length > 0)
          .map((v) => String(v).trim())
          .join(" ")) || null;

  return {
    id: item.submissionId as string,
    tenantId: item.tenantId as string,
    tenantCode: item.tenantCode as string,
    courseId: item.courseId as string,
    formId: item.formId as string,
    formVersion: item.formVersion as number,
    status: item.status as SubmissionStatus,
    applicant,
    answers: (item.answers as Record<string, unknown>) ?? {},
    submittedAt: item.submittedAt as string,
    reviewedAt: (item.reviewedAt as string | null) ?? null,
    reviewedBy: (item.reviewedBy as string | null) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: (item.updatedAt as string | undefined) ?? undefined,
    applicantSummary: {
      email: typeof emailValue === "string" ? emailValue : null,
      name: fullName
    },
    course: {
      id: item.courseId as string
    }
  };
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

function normalizeFieldId(fieldId: string): string {
  return fieldId.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isTextAnswer(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function extractApplicantIdentity(
  fields: FormField[],
  answers: Record<string, unknown>
): Record<string, unknown> {
  const applicant: Record<string, unknown> = {};
  const fullNameFieldIds = new Set(["fullname", "name", "applicantname"]);
  const firstNameFieldIds = new Set(["firstname", "givenname"]);
  const lastNameFieldIds = new Set(["lastname", "familyname", "surname"]);

  for (const field of fields) {
    const answer = answers[field.fieldId];
    if (!isTextAnswer(answer)) {
      continue;
    }

    const normalizedFieldId = normalizeFieldId(field.fieldId);
    if (field.type === "email" && applicant.email === undefined) {
      applicant.email = answer.trim();
      continue;
    }
    if (fullNameFieldIds.has(normalizedFieldId) && applicant.name === undefined) {
      applicant.name = answer.trim();
      continue;
    }
    if (firstNameFieldIds.has(normalizedFieldId) && applicant.firstName === undefined) {
      applicant.firstName = answer.trim();
      continue;
    }
    if (lastNameFieldIds.has(normalizedFieldId) && applicant.lastName === undefined) {
      applicant.lastName = answer.trim();
    }
  }

  return applicant;
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

export async function listOrgSubmissions(
  tenantId: string,
  input: ListSubmissionsInput
): Promise<ListSubmissionsResult> {
  if (testListOrgSubmissionsOverride) {
    return testListOrgSubmissionsOverride(tenantId, input);
  }
  const limit = parseLimit(input.limit);
  const offset = decodeOffsetCursor(input.cursor);
  const submittedFrom = input.submittedFrom ? parseIsoDateTime(input.submittedFrom, "submittedFrom") : undefined;
  const submittedTo = input.submittedTo ? parseIsoDateTime(input.submittedTo, "submittedTo") : undefined;

  if (submittedFrom && submittedTo && submittedFrom > submittedTo) {
    throw new ApiError(400, "VALIDATION_ERROR", "submittedFrom must be before or equal to submittedTo.");
  }

  const exprValues: Record<string, unknown> = {
    ":pk": tenantPk(tenantId),
    ":sk": "SUBMISSION#"
  };
  const filters: string[] = [];
  const exprNames: Record<string, string> = {};

  if (input.courseId) {
    exprValues[":courseId"] = input.courseId;
    filters.push("courseId = :courseId");
  }
  if (input.status) {
    exprNames["#status"] = "status";
    exprValues[":status"] = input.status;
    filters.push("#status = :status");
  }
  if (submittedFrom) {
    exprValues[":submittedFrom"] = submittedFrom;
    filters.push("submittedAt >= :submittedFrom");
  }
  if (submittedTo) {
    exprValues[":submittedTo"] = submittedTo;
    filters.push("submittedAt <= :submittedTo");
  }

  const allItems: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined = undefined;
  do {
    const out = await sendDdb(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        FilterExpression: filters.length > 0 ? filters.join(" AND ") : undefined,
        ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
        ExpressionAttributeValues: exprValues,
        ExclusiveStartKey: lastKey
      })
    );
    allItems.push(...((out.Items ?? []) as Record<string, unknown>[]));
    lastKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  const sorted = allItems
    .map((item) => submissionFromItem(item))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));

  const pageData = sorted.slice(offset, offset + limit);
  const nextOffset = offset + pageData.length < sorted.length ? offset + pageData.length : null;
  return {
    data: pageData,
    page: {
      limit,
      nextCursor: encodeOffsetCursor(nextOffset)
    }
  };
}

export async function getOrgSubmission(tenantId: string, submissionId: string): Promise<Submission> {
  if (testGetOrgSubmissionOverride) {
    return testGetOrgSubmissionOverride(tenantId, submissionId);
  }
  const out = await sendDdb(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: tenantPk(tenantId),
        SK: submissionSk(submissionId)
      }
    })
  );

  if (!out.Item) {
    throw new ApiError(404, "NOT_FOUND", "Submission not found.");
  }
  return submissionFromItem(out.Item as Record<string, unknown>);
}

export async function updateOrgSubmissionStatus(
  tenantId: string,
  submissionId: string,
  actorUserId: string,
  input: UpdateSubmissionStatusInput
): Promise<Submission> {
  if (input.status !== "reviewed" && input.status !== "canceled") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "status must be one of reviewed or canceled for submission updates."
    );
  }

  const now = new Date().toISOString();
  const reviewedAt = input.status === "reviewed" ? now : null;
  const reviewedBy = input.status === "reviewed" ? actorUserId : null;

  let out;
  try {
    out = await sendDdb(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          PK: tenantPk(tenantId),
          SK: submissionSk(submissionId)
        },
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK) AND #status = :submitted",
        UpdateExpression:
          "SET #status = :status, #reviewedAt = :reviewedAt, #reviewedBy = :reviewedBy, #updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
          "#reviewedAt": "reviewedAt",
          "#reviewedBy": "reviewedBy",
          "#updatedAt": "updatedAt"
        },
        ExpressionAttributeValues: {
          ":submitted": "submitted",
          ":status": input.status,
          ":reviewedAt": reviewedAt,
          ":reviewedBy": reviewedBy,
          ":updatedAt": now
        },
        ReturnValues: "ALL_NEW"
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "ConditionalCheckFailedException") {
      const current = await getOrgSubmission(tenantId, submissionId);
      if (current.status === input.status) {
        throw new ApiError(409, "CONFLICT", "Submission is already in the requested status.");
      }
      throw new ApiError(
        409,
        "CONFLICT",
        `Invalid submission status transition from ${current.status} to ${input.status}.`
      );
    }
    throw error;
  }

  if (!out.Attributes) {
    throw new ApiError(404, "NOT_FOUND", "Submission not found.");
  }
  return submissionFromItem(out.Attributes as Record<string, unknown>);
}

export async function createPublicEnrollment(
  tenantCode: string,
  courseId: string,
  idempotencyKeyRaw: string,
  input: CreateEnrollmentInput
): Promise<EnrollmentCreateResult> {
  if (testCreatePublicEnrollmentOverride) {
    return testCreatePublicEnrollmentOverride(tenantCode, courseId, idempotencyKeyRaw, input);
  }
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
    submittedAt: nowIso,
    tenantCode: tenantCode.trim().toLowerCase(),
    courseId,
    courseTitle: publicCourse.title,
    links: {
      tenantHome: `/v1/public/${tenantCode.trim().toLowerCase()}/tenant-home`,
      course: `/v1/public/${tenantCode.trim().toLowerCase()}/courses/${courseId}`
    }
  };
  const submissionItem = {
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
    applicant: extractApplicantIdentity(schema.fields, input.answers),
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
  };
  const idempotencyItem = {
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
  };

  try {
    await sendDdb(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: idempotencyItem,
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          },
          {
            Put: {
              TableName: tableName,
              Item: submissionItem,
              ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
            }
          }
        ]
      })
    );
  } catch (error) {
    if ((error as { name?: string }).name === "TransactionCanceledException") {
      const existing = await sendDdb(
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

  return snapshot;
}

export const __submissionsTestHooks = {
  setListOrgSubmissionsOverride(
    loader: ((tenantId: string, input: ListSubmissionsInput) => Promise<ListSubmissionsResult>) | null
  ): void {
    testListOrgSubmissionsOverride = loader;
  },
  setGetOrgSubmissionOverride(
    loader: ((tenantId: string, submissionId: string) => Promise<Submission>) | null
  ): void {
    testGetOrgSubmissionOverride = loader;
  },
  setCreatePublicEnrollmentOverride(
    loader:
      | ((
          tenantCode: string,
          courseId: string,
          idempotencyKeyRaw: string,
          input: CreateEnrollmentInput
        ) => Promise<EnrollmentCreateResult>)
      | null
  ): void {
    testCreatePublicEnrollmentOverride = loader;
  },
  setDdbSendOverride(loader: ((command: object) => Promise<Record<string, unknown>>) | null): void {
    testDdbSendOverride = loader;
  },
  reset(): void {
    testListOrgSubmissionsOverride = null;
    testGetOrgSubmissionOverride = null;
    testCreatePublicEnrollmentOverride = null;
    testDdbSendOverride = null;
  }
};
