import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";
import { getCourse } from "./courses";

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "single_select"
  | "multi_select"
  | "checkbox"
  | "date";

export type FormFieldOption = {
  label: string;
  value: string;
};

export type FormFieldValidation = {
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  pattern?: string | null;
};

export type FormField = {
  fieldId: string;
  type: FormFieldType;
  label: string;
  helpText?: string | null;
  required: boolean;
  displayOrder: number;
  options?: FormFieldOption[];
  validation?: FormFieldValidation;
};

export type FormSchema = {
  formId: string;
  version: number;
  tenantId: string;
  courseId: string;
  status: "active";
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
};

type FormSchemaItem = {
  PK: string;
  SK: string;
  entityType: "FORM_VERSION";
  tenantId: string;
  courseId: string;
  formId: string;
  version: number;
  status: "active";
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function formVersionSk(courseId: string, version: number): string {
  const padded = version.toString().padStart(4, "0");
  return `COURSE#${courseId}#FORMVER#${padded}`;
}

function courseSk(courseId: string): string {
  return `COURSE#${courseId}`;
}

function validateField(field: FormField): void {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(field.fieldId)) {
    throw new ApiError(400, "VALIDATION_ERROR", `Invalid fieldId: ${field.fieldId}`);
  }
  if (!field.label?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field ${field.fieldId} requires label.`);
  }
  if (field.displayOrder < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field ${field.fieldId} requires displayOrder >= 1.`);
  }
  if (
    (field.type === "single_select" || field.type === "multi_select") &&
    (!field.options || field.options.length === 0)
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", `Field ${field.fieldId} requires non-empty options.`);
  }
}

export function validateFormFields(fields: FormField[]): void {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one form field is required.");
  }
  const fieldIds = new Set<string>();
  const displayOrders = new Set<number>();

  for (const field of fields) {
    validateField(field);
    if (fieldIds.has(field.fieldId)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Duplicate fieldId: ${field.fieldId}`);
    }
    if (displayOrders.has(field.displayOrder)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Duplicate displayOrder: ${field.displayOrder}`);
    }
    fieldIds.add(field.fieldId);
    displayOrders.add(field.displayOrder);
  }
}

function fromItem(item: FormSchemaItem): FormSchema {
  return {
    formId: item.formId,
    version: item.version,
    tenantId: item.tenantId,
    courseId: item.courseId,
    status: item.status,
    fields: item.fields,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function getLatestItem(tenantId: string, courseId: string): Promise<FormSchemaItem | null> {
  const out = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":sk": `COURSE#${courseId}#FORMVER#`
      },
      ScanIndexForward: false,
      Limit: 1
    })
  );

  const first = out.Items?.[0];
  return (first as FormSchemaItem | undefined) ?? null;
}

export async function upsertCourseFormSchema(
  tenantId: string,
  courseId: string,
  userId: string,
  fields: FormField[]
): Promise<{ formId: string; version: number }> {
  validateFormFields(fields);
  await getCourse(tenantId, courseId);

  const latest = await getLatestItem(tenantId, courseId);
  const nextVersion = latest ? latest.version + 1 : 1;
  const formId = latest?.formId ?? `frm_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  const item: FormSchemaItem = {
    PK: tenantPk(tenantId),
    SK: formVersionSk(courseId, nextVersion),
    entityType: "FORM_VERSION",
    tenantId,
    courseId,
    formId,
    version: nextVersion,
    status: "active",
    fields,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression:
        "SET #activeFormId = :formId, #activeFormVersion = :version, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
      ExpressionAttributeNames: {
        "#activeFormId": "activeFormId",
        "#activeFormVersion": "activeFormVersion",
        "#updatedAt": "updatedAt",
        "#updatedBy": "updatedBy"
      },
      ExpressionAttributeValues: {
        ":formId": formId,
        ":version": nextVersion,
        ":updatedAt": now,
        ":updatedBy": userId
      }
    })
  );

  return { formId, version: nextVersion };
}

export async function getLatestCourseFormSchema(tenantId: string, courseId: string): Promise<FormSchema> {
  await getCourse(tenantId, courseId);
  const latest = await getLatestItem(tenantId, courseId);
  if (!latest) throw new ApiError(404, "NOT_FOUND", "Form schema not found for course.");
  return fromItem(latest);
}

export async function getCourseFormSchemaVersion(
  tenantId: string,
  courseId: string,
  version: number
): Promise<FormSchema> {
  if (!Number.isInteger(version) || version < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", "version must be a positive integer.");
  }
  await getCourse(tenantId, courseId);

  const out = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: formVersionSk(courseId, version) }
    })
  );

  if (!out.Item) throw new ApiError(404, "NOT_FOUND", "Form schema version not found.");
  return fromItem(out.Item as FormSchemaItem);
}
