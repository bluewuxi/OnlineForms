import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";
import { validateFormFields, type FormField } from "./formSchemas";

export type { FormField };

export type FormTemplate = {
  templateId: string;
  tenantId: string;
  name: string;
  description: string | null;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type CreateFormTemplateInput = {
  name: string;
  description?: string | null;
  fields: FormField[];
};

export type UpdateFormTemplateInput = {
  name?: string;
  description?: string | null;
  fields?: FormField[];
};

type FormTemplateItem = {
  PK: string;
  SK: string;
  entityType: "FORM_TEMPLATE";
  templateId: string;
  tenantId: string;
  name: string;
  description: string | null;
  fields: FormField[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
let testDdbSendOverride: ((command: object) => Promise<unknown>) | null = null;

async function sendDdb<TResult>(command: object): Promise<TResult> {
  if (testDdbSendOverride) {
    return (await testDdbSendOverride(command)) as TResult;
  }
  return (await ddb.send(command as never)) as TResult;
}

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function templateSk(templateId: string): string {
  return `FORMTEMPLATE#${templateId}`;
}

function generateTemplateId(): string {
  return `ftpl_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function validateName(name: string): void {
  if (!name?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "Template name is required.");
  }
  if (name.trim().length > 120) {
    throw new ApiError(400, "VALIDATION_ERROR", "Template name must be 120 characters or fewer.");
  }
}

function fromItem(item: FormTemplateItem): FormTemplate {
  return {
    templateId: item.templateId,
    tenantId: item.tenantId,
    name: item.name,
    description: item.description,
    fields: item.fields,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    createdBy: item.createdBy,
    updatedBy: item.updatedBy,
  };
}

export async function createFormTemplate(
  tenantId: string,
  userId: string,
  input: CreateFormTemplateInput
): Promise<FormTemplate> {
  validateName(input.name);
  validateFormFields(input.fields);

  const templateId = generateTemplateId();
  const now = new Date().toISOString();

  const item: FormTemplateItem = {
    PK: tenantPk(tenantId),
    SK: templateSk(templateId),
    entityType: "FORM_TEMPLATE",
    templateId,
    tenantId,
    name: input.name.trim(),
    description: input.description ?? null,
    fields: input.fields,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId,
  };

  await sendDdb(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
    })
  );

  return fromItem(item);
}

export async function getFormTemplate(
  tenantId: string,
  templateId: string
): Promise<FormTemplate> {
  const out = await sendDdb<{ Item?: Record<string, unknown> }>(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: templateSk(templateId) },
    })
  );

  if (!out.Item || (out.Item as FormTemplateItem).entityType !== "FORM_TEMPLATE") {
    throw new ApiError(404, "NOT_FOUND", "Form template not found.");
  }

  return fromItem(out.Item as FormTemplateItem);
}

export async function listFormTemplates(tenantId: string): Promise<FormTemplate[]> {
  const out = await sendDdb<{ Items?: unknown[] }>(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":sk": "FORMTEMPLATE#",
      },
    })
  );

  const items = (out.Items ?? []) as FormTemplateItem[];
  return items
    .filter((item) => item.entityType === "FORM_TEMPLATE")
    .map(fromItem)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateFormTemplate(
  tenantId: string,
  templateId: string,
  userId: string,
  input: UpdateFormTemplateInput
): Promise<FormTemplate> {
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "No fields provided to update.");
  }
  if (input.name !== undefined) validateName(input.name);
  if (input.fields !== undefined) validateFormFields(input.fields);

  const now = new Date().toISOString();
  const updateParts: string[] = ["#updatedAt = :updatedAt", "#updatedBy = :updatedBy"];
  const exprNames: Record<string, string> = {
    "#updatedAt": "updatedAt",
    "#updatedBy": "updatedBy",
  };
  const exprValues: Record<string, unknown> = {
    ":updatedAt": now,
    ":updatedBy": userId,
  };

  if (input.name !== undefined) {
    updateParts.push("#name = :name");
    exprNames["#name"] = "name";
    exprValues[":name"] = input.name.trim();
  }
  if (input.description !== undefined) {
    updateParts.push("#description = :description");
    exprNames["#description"] = "description";
    exprValues[":description"] = input.description ?? null;
  }
  if (input.fields !== undefined) {
    updateParts.push("#fields = :fields");
    exprNames["#fields"] = "fields";
    exprValues[":fields"] = input.fields;
  }

  const out = await sendDdb<{ Attributes?: Record<string, unknown> }>(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: templateSk(templateId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW",
    })
  );

  if (!out.Attributes) {
    throw new ApiError(404, "NOT_FOUND", "Form template not found.");
  }

  return fromItem(out.Attributes as FormTemplateItem);
}

export async function deleteFormTemplate(
  tenantId: string,
  templateId: string
): Promise<void> {
  await sendDdb(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: templateSk(templateId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
    })
  );
}

export const __formTemplatesTestHooks = {
  setDdbSendOverride(loader: ((command: object) => Promise<unknown>) | null): void {
    testDdbSendOverride = loader;
  },
  reset(): void {
    testDdbSendOverride = null;
  },
};
