import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { assertAssetBindable, resolveAssetPublicUrl } from "./assets";
import { ApiError } from "./errors";
import { getCourseFormSchemaVersion, type FormField } from "./formSchemas";
import { normalizeTenantCode } from "./tenantCodes";

export type CourseStatus = "draft" | "published" | "archived";
export type PricingMode = "free" | "paid_placeholder";
export type DeliveryMode = "online" | "onsite" | "hybrid";

export type Course = {
  id: string;
  tenantId: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  startDate: string;
  endDate: string;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  deliveryMode: DeliveryMode;
  locationText: string | null;
  capacity: number | null;
  status: CourseStatus;
  publicVisible: boolean;
  pricingMode: PricingMode;
  paymentEnabledFlag: boolean;
  imageAssetId: string | null;
  activeFormId: string | null;
  activeFormVersion: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type CreateCourseInput = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  startDate: string;
  endDate: string;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  deliveryMode: DeliveryMode;
  locationText: string | null;
  capacity: number | null;
  pricingMode: PricingMode;
  imageAssetId: string | null;
};

export type UpdateCourseInput = Partial<CreateCourseInput> & {
  publicVisible?: boolean;
};

export type ListCoursesInput = {
  status?: CourseStatus;
  pricingMode?: PricingMode;
  deliveryMode?: DeliveryMode;
  publicVisible?: boolean;
  q?: string;
};

export type PublicCourse = {
  id: string;
  title: string;
  shortDescription: string;
  imageUrl: string | null;
  startDate: string;
  endDate: string;
  deliveryMode: DeliveryMode;
  pricingMode: PricingMode;
  locationText: string | null;
  enrollmentOpenAt: string;
  enrollmentCloseAt: string;
  enrollmentOpenNow: boolean;
  enrollmentStatus: "upcoming" | "open" | "closed";
  links: {
    detail: string;
    enrollmentForm: string;
  };
};

export type PublicCoursesListResult = {
  data: PublicCourse[];
  page: {
    limit: number;
    nextCursor: string | null;
  };
};

export type PublicCourseDetail = PublicCourse & {
  fullDescription: string;
  capacity: number | null;
  formAvailable: boolean;
  formVersion: number | null;
  formSchema: {
    version: number;
    fields: FormField[];
  } | null;
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const tableName = process.env.ONLINEFORMS_TABLE ?? "OnlineFormsMain";
const COURSE_PUBLIC_PROJECTION_VERSION = 1;
let testPublicCoursesListOverride:
  | ((tenantCode: string, q?: string, limitRaw?: number, cursor?: string) => Promise<PublicCoursesListResult>)
  | null = null;
let testPublicCourseDetailOverride:
  | ((tenantCode: string, courseId: string) => Promise<PublicCourseDetail>)
  | null = null;
let testGetCourseOverride: ((tenantId: string, courseId: string) => Promise<Course>) | null = null;
let testListCoursesOverride: ((tenantId: string, input?: ListCoursesInput) => Promise<Course[]>) | null = null;
let testResolveTenantIdByCodeOverride: ((tenantCode: string) => Promise<string>) | null = null;
let testDdbSendOverride:
  | ((command: object) => Promise<unknown>)
  | null = null;

async function sendDdb<TResult>(command: object): Promise<TResult> {
  if (testDdbSendOverride) {
    return (await testDdbSendOverride(command)) as TResult;
  }
  return (await ddb.send(command as never)) as TResult;
}

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function courseSk(courseId: string): string {
  return `COURSE#${courseId}`;
}

function coursePublicSk(courseId: string): string {
  return `COURSE_PUBLIC#${courseId}`;
}

function tenantCodePk(tenantCode: string): string {
  return `TENANTCODE#${tenantCode}`;
}

async function resolveTenantCodeById(tenantId: string): Promise<string> {
  const out = await sendDdb<{ Item?: Record<string, unknown> }>(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: "PROFILE" }
    })
  );
  const item = out.Item as Record<string, unknown> | undefined;
  const tenantCode = item?.tenantCode;
  if (typeof tenantCode !== "string" || tenantCode.trim().length === 0) {
    throw new ApiError(409, "CONFLICT", "Tenant profile missing tenantCode for public projection.");
  }
  return normalizeTenantCode(tenantCode, {
    statusCode: 409,
    code: "CONFLICT",
    messagePrefix: "Tenant profile has invalid tenantCode for public projection."
  });
}

function publicCourseLinks(tenantCode: string, courseId: string): { detail: string; enrollmentForm: string } {
  return {
    detail: `/v1/public/${tenantCode}/courses/${courseId}`,
    enrollmentForm: `/v1/public/${tenantCode}/courses/${courseId}/form`
  };
}

function computeEnrollmentWindow(
  enrollmentOpenAt: string,
  enrollmentCloseAt: string
): { enrollmentOpenNow: boolean; enrollmentStatus: "upcoming" | "open" | "closed" } {
  const nowMs = Date.now();
  const openAtMs = Date.parse(enrollmentOpenAt);
  const closeAtMs = Date.parse(enrollmentCloseAt);
  const enrollmentOpenNow =
    Number.isFinite(openAtMs) && Number.isFinite(closeAtMs) && openAtMs <= nowMs && nowMs <= closeAtMs;

  if (!Number.isFinite(openAtMs) || !Number.isFinite(closeAtMs)) {
    return { enrollmentOpenNow: false, enrollmentStatus: "closed" };
  }
  if (nowMs < openAtMs) {
    return { enrollmentOpenNow: false, enrollmentStatus: "upcoming" };
  }
  if (nowMs > closeAtMs) {
    return { enrollmentOpenNow: false, enrollmentStatus: "closed" };
  }
  return { enrollmentOpenNow: true, enrollmentStatus: "open" };
}

function parsePublicListLimit(limitRaw: number | undefined): number {
  if (limitRaw === undefined) return 20;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "limit must be an integer between 1 and 100.");
  }
  return limitRaw;
}

function encodePublicListCursor(lastEvaluatedKey: Record<string, unknown> | undefined): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), "utf-8").toString("base64");
}

function decodePublicListCursor(cursor: string): Record<string, unknown> {
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

function courseFromItem(item: Record<string, unknown>): Course {
  return {
    id: item.courseId as string,
    tenantId: item.tenantId as string,
    title: item.title as string,
    shortDescription: item.shortDescription as string,
    fullDescription: item.fullDescription as string,
    startDate: item.startDate as string,
    endDate: item.endDate as string,
    enrollmentOpenAt: item.enrollmentOpenAt as string,
    enrollmentCloseAt: item.enrollmentCloseAt as string,
    deliveryMode: item.deliveryMode as DeliveryMode,
    locationText: (item.locationText as string | null) ?? null,
    capacity: (item.capacity as number | null) ?? null,
    status: item.status as CourseStatus,
    publicVisible: Boolean(item.publicVisible),
    pricingMode: item.pricingMode as PricingMode,
    paymentEnabledFlag: Boolean(item.paymentEnabledFlag),
    imageAssetId: (item.imageAssetId as string | null) ?? null,
    activeFormId: (item.activeFormId as string | null) ?? null,
    activeFormVersion: (item.activeFormVersion as number | null) ?? null,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
    createdBy: item.createdBy as string,
    updatedBy: item.updatedBy as string
  };
}

async function resolvePublicCourseImageUrl(item: Record<string, unknown>): Promise<string | null> {
  const tenantId = item.tenantId as string | undefined;
  const explicitAssetId = item.imageAssetId as string | null | undefined;
  const legacyImageUrl = (item.imageUrl as string | null) ?? null;
  const fallbackAssetId =
    typeof legacyImageUrl === "string"
      ? legacyImageUrl.match(/(ast_[a-zA-Z0-9]+)/)?.[1] ?? null
      : null;
  const imageAssetId = explicitAssetId ?? fallbackAssetId;

  if (!tenantId || !imageAssetId) {
    return legacyImageUrl;
  }

  return resolveAssetPublicUrl(tenantId, imageAssetId);
}

async function publicCourseFromItem(item: Record<string, unknown>): Promise<PublicCourse> {
  const tenantCode = item.tenantCode as string;
  const courseId = item.courseId as string;
  const enrollmentOpenAt = item.enrollmentOpenAt as string;
  const enrollmentCloseAt = item.enrollmentCloseAt as string;
  const enrollmentWindow = computeEnrollmentWindow(enrollmentOpenAt, enrollmentCloseAt);
  return {
    id: courseId,
    title: item.title as string,
    shortDescription: item.shortDescription as string,
    imageUrl: await resolvePublicCourseImageUrl(item),
    startDate: item.startDate as string,
    endDate: item.endDate as string,
    deliveryMode: item.deliveryMode as DeliveryMode,
    pricingMode: item.pricingMode as PricingMode,
    locationText: (item.locationText as string | null) ?? null,
    enrollmentOpenAt,
    enrollmentCloseAt,
    enrollmentOpenNow: enrollmentWindow.enrollmentOpenNow,
    enrollmentStatus: enrollmentWindow.enrollmentStatus,
    links: publicCourseLinks(tenantCode, courseId)
  };
}

function isValidPublicProjection(item: Record<string, unknown>, tenantCode: string): boolean {
  const projectionVersion = item.projectionVersion;
  if (projectionVersion !== COURSE_PUBLIC_PROJECTION_VERSION) return false;
  if (item.entityType !== "COURSE_PUBLIC") return false;
  if (item.status !== "published") return false;
  if (!Boolean(item.publicVisible)) return false;
  if (typeof item.courseId !== "string" || typeof item.title !== "string") return false;
  if (typeof item.shortDescription !== "string") return false;
  if (typeof item.fullDescription !== "string") return false;
  if (typeof item.startDate !== "string" || typeof item.endDate !== "string") return false;
  if (typeof item.enrollmentOpenAt !== "string" || typeof item.enrollmentCloseAt !== "string") return false;
  if (typeof item.deliveryMode !== "string" || typeof item.pricingMode !== "string") return false;
  if (typeof item.tenantCode !== "string") return false;
  if (item.tenantCode.toLowerCase() !== tenantCode.toLowerCase()) return false;
  return true;
}

async function publicCourseDetailFromItem(item: Record<string, unknown>): Promise<PublicCourseDetail> {
  const activeFormVersion = Number.isInteger(item.activeFormVersion) ? (item.activeFormVersion as number) : null;
  let formSchema: { version: number; fields: FormField[] } | null = null;

  if (typeof item.tenantId === "string" && typeof item.courseId === "string" && activeFormVersion) {
    try {
      const schema = await getCourseFormSchemaVersion(item.tenantId, item.courseId, activeFormVersion);
      formSchema = {
        version: schema.version,
        fields: schema.fields
      };
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 404) {
        throw error;
      }
    }
  }

  return {
    ...(await publicCourseFromItem(item)),
    fullDescription: item.fullDescription as string,
    capacity: (item.capacity as number | null) ?? null,
    formAvailable: Boolean(item.activeFormId) && activeFormVersion !== null && formSchema !== null,
    formVersion: formSchema?.version ?? activeFormVersion,
    formSchema
  };
}

async function buildPublicProjectionItem(course: Course, tenantCode: string): Promise<Record<string, unknown>> {
  return {
    PK: tenantPk(course.tenantId),
    SK: coursePublicSk(course.id),
    projectionVersion: COURSE_PUBLIC_PROJECTION_VERSION,
    entityType: "COURSE_PUBLIC",
    tenantId: course.tenantId,
    tenantCode,
    courseId: course.id,
    title: course.title,
    shortDescription: course.shortDescription,
    fullDescription: course.fullDescription,
    imageAssetId: course.imageAssetId,
    imageUrl: course.imageAssetId ? `asset://${course.imageAssetId}` : null,
    startDate: course.startDate,
    endDate: course.endDate,
    enrollmentOpenAt: course.enrollmentOpenAt,
    enrollmentCloseAt: course.enrollmentCloseAt,
    deliveryMode: course.deliveryMode,
    locationText: course.locationText,
    capacity: course.capacity,
    pricingMode: course.pricingMode,
    activeFormId: course.activeFormId,
    activeFormVersion: course.activeFormVersion,
    status: course.status,
    publicVisible: course.publicVisible,
    updatedAt: course.updatedAt,
    GSI2PK: `TENANTCODE#${tenantCode}#COURSES`,
    GSI2SK: `START#${course.startDate}#COURSE#${course.id}`
  };
}

async function upsertPublicProjection(course: Course): Promise<void> {
  if (course.status !== "published" || !course.publicVisible) return;
  const tenantCode = await resolveTenantCodeById(course.tenantId);
  await sendDdb(
    new PutCommand({
      TableName: tableName,
      Item: await buildPublicProjectionItem(course, tenantCode)
    })
  );
}

async function deletePublicProjection(tenantId: string, courseId: string): Promise<void> {
  await sendDdb(
    new DeleteCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: coursePublicSk(courseId) }
    })
  );
}

function validateCreate(input: CreateCourseInput): void {
  if (!input.title?.trim()) throw new ApiError(400, "VALIDATION_ERROR", "title is required.");
  if (!input.shortDescription?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "shortDescription is required.");
  }
  if (!input.fullDescription?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "fullDescription is required.");
  }
  if (!input.startDate) throw new ApiError(400, "VALIDATION_ERROR", "startDate is required.");
  if (!input.endDate) throw new ApiError(400, "VALIDATION_ERROR", "endDate is required.");
  if (!input.enrollmentOpenAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "enrollmentOpenAt is required.");
  }
  if (!input.enrollmentCloseAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "enrollmentCloseAt is required.");
  }
}

function normalizeFieldId(fieldId: string): string {
  return fieldId.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function hasRequiredApplicantIdentityField(fields: FormField[]): boolean {
  const fullNameFieldIds = new Set(["fullname", "name", "applicantname"]);
  const firstNameFieldIds = new Set(["firstname", "givenname"]);
  const lastNameFieldIds = new Set(["lastname", "familyname", "surname"]);

  return fields.some((field) => {
    if (!field.required) {
      return false;
    }
    if (field.type === "email") {
      return true;
    }
    const normalizedFieldId = normalizeFieldId(field.fieldId);
    return (
      fullNameFieldIds.has(normalizedFieldId) ||
      firstNameFieldIds.has(normalizedFieldId) ||
      lastNameFieldIds.has(normalizedFieldId)
    );
  });
}

export async function createCourse(
  tenantId: string,
  userId: string,
  input: CreateCourseInput
): Promise<Course> {
  validateCreate(input);
  if (input.imageAssetId) {
    await assertAssetBindable(tenantId, input.imageAssetId, "course_image");
  }
  const now = new Date().toISOString();
  const id = `crs_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const item = {
    PK: tenantPk(tenantId),
    SK: courseSk(id),
    entityType: "COURSE",
    tenantId,
    courseId: id,
    title: input.title.trim(),
    shortDescription: input.shortDescription.trim(),
    fullDescription: input.fullDescription.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    enrollmentOpenAt: input.enrollmentOpenAt,
    enrollmentCloseAt: input.enrollmentCloseAt,
    deliveryMode: input.deliveryMode,
    locationText: input.locationText ?? null,
    capacity: input.capacity ?? null,
    status: "draft" as CourseStatus,
    publicVisible: false,
    pricingMode: input.pricingMode,
    paymentEnabledFlag: false,
    imageAssetId: input.imageAssetId ?? null,
    activeFormId: null,
    activeFormVersion: null,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  await sendDdb(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    })
  );

  return courseFromItem(item);
}

export async function getCourse(tenantId: string, courseId: string): Promise<Course> {
  if (testGetCourseOverride) {
    return testGetCourseOverride(tenantId, courseId);
  }
  const out = await sendDdb<{ Item?: Record<string, unknown> }>(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) }
    })
  );

  if (!out.Item) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  return courseFromItem(out.Item as Record<string, unknown>);
}

export async function listCourses(tenantId: string, input: ListCoursesInput = {}): Promise<Course[]> {
  if (testListCoursesOverride) {
    return testListCoursesOverride(tenantId, input);
  }
  const out = await sendDdb<{ Items?: unknown[] }>(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": tenantPk(tenantId),
        ":sk": "COURSE#"
      }
    })
  );
  const keyword = input.q?.trim().toLowerCase();
  return (out.Items ?? [])
    .map((i) => courseFromItem(i as Record<string, unknown>))
    .filter((course) => {
      if (input.status && course.status !== input.status) return false;
      if (input.pricingMode && course.pricingMode !== input.pricingMode) return false;
      if (input.deliveryMode && course.deliveryMode !== input.deliveryMode) return false;
      if (input.publicVisible !== undefined && course.publicVisible !== input.publicVisible) return false;
      if (keyword) {
        const haystack = `${course.title} ${course.shortDescription} ${course.fullDescription}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
}

export async function updateCourse(
  tenantId: string,
  courseId: string,
  userId: string,
  input: UpdateCourseInput
): Promise<Course> {
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "No fields provided for update.");
  }

  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "No fields provided for update.");
  }
  if (input.imageAssetId) {
    await assertAssetBindable(tenantId, input.imageAssetId, "course_image");
  }

  const current = await getCourse(tenantId, courseId);
  const nextPricingMode = input.pricingMode ?? current.pricingMode;
  const nextPublicVisible = input.publicVisible ?? current.publicVisible;
  const nextStatus = current.status;

  if (nextPricingMode === "paid_placeholder" && nextPublicVisible) {
    throw new ApiError(
      409,
      "CONFLICT",
      "paid_placeholder courses cannot be public while payments are disabled."
    );
  }
  if (nextPricingMode === "paid_placeholder" && nextStatus === "published") {
    throw new ApiError(
      409,
      "CONFLICT",
      "Published courses cannot use paid_placeholder pricing while payments are disabled."
    );
  }
  if (nextPublicVisible && nextPricingMode !== "free") {
    throw new ApiError(409, "CONFLICT", "Only free courses can be public in MVP.");
  }

  const exprNames: Record<string, string> = { "#updatedAt": "updatedAt", "#updatedBy": "updatedBy" };
  const exprValues: Record<string, unknown> = {
    ":updatedAt": new Date().toISOString(),
    ":updatedBy": userId
  };
  const updates: string[] = ["#updatedAt = :updatedAt", "#updatedBy = :updatedBy"];

  for (const [key, value] of entries) {
    const nk = `#${key}`;
    const vk = `:${key}`;
    exprNames[nk] = key;
    exprValues[vk] = value;
    updates.push(`${nk} = ${vk}`);
  }

  const out = await sendDdb<{ Attributes?: Record<string, unknown> }>(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression: `SET ${updates.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: "ALL_NEW"
    })
  );

  if (!out.Attributes) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  const course = courseFromItem(out.Attributes as Record<string, unknown>);
  if (course.status === "published" && course.publicVisible) {
    await upsertPublicProjection(course);
  } else {
    await deletePublicProjection(tenantId, courseId);
  }
  return course;
}

export async function setCourseStatus(
  tenantId: string,
  courseId: string,
  userId: string,
  action: "publish" | "archive"
): Promise<Course> {
  const current = await getCourse(tenantId, courseId);

  if (action === "publish") {
    if (current.status !== "draft") {
      throw new ApiError(409, "CONFLICT", "Only draft courses can be published.");
    }
    if (current.pricingMode !== "free") {
      throw new ApiError(409, "CONFLICT", "MVP only supports free course publishing.");
    }
    if (current.paymentEnabledFlag) {
      throw new ApiError(409, "CONFLICT", "paymentEnabledFlag must remain false in MVP.");
    }
    const activeFormVersion = current.activeFormVersion;
    if (!current.activeFormId || typeof activeFormVersion !== "number" || !Number.isInteger(activeFormVersion)) {
      throw new ApiError(409, "CONFLICT", "Published courses require an active form schema.");
    }
    const activeSchema = await getCourseFormSchemaVersion(tenantId, courseId, activeFormVersion);
    if (!hasRequiredApplicantIdentityField(activeSchema.fields)) {
      throw new ApiError(
        409,
        "CONFLICT",
        "Published courses require at least one required applicant identity field."
      );
    }
  }

  const nextStatus: CourseStatus = action === "publish" ? "published" : "archived";
  const nextPublicVisible = action === "publish";

  const out = await sendDdb<{ Attributes?: Record<string, unknown> }>(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: courseSk(courseId) },
      ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
      UpdateExpression:
        "SET #status = :status, #publicVisible = :publicVisible, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
      ExpressionAttributeNames: {
        "#status": "status",
        "#publicVisible": "publicVisible",
        "#updatedAt": "updatedAt",
        "#updatedBy": "updatedBy"
      },
      ExpressionAttributeValues: {
        ":status": nextStatus,
        ":publicVisible": nextPublicVisible,
        ":updatedAt": new Date().toISOString(),
        ":updatedBy": userId
      },
      ReturnValues: "ALL_NEW"
    })
  );

  if (!out.Attributes) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  const course = courseFromItem(out.Attributes as Record<string, unknown>);
  if (action === "publish") {
    await upsertPublicProjection(course);
  } else {
    await deletePublicProjection(tenantId, courseId);
  }
  return course;
}

export async function resolveTenantIdByCode(tenantCode: string): Promise<string> {
  if (testResolveTenantIdByCodeOverride) {
    return testResolveTenantIdByCodeOverride(tenantCode);
  }
  const normalizedCode = normalizeTenantCode(tenantCode);
  const out = await sendDdb<{ Item?: Record<string, unknown> }>(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantCodePk(normalizedCode), SK: "MAP" }
    })
  );

  const item = out.Item as Record<string, unknown> | undefined;
  if (!item || item.status === "suspended") {
    throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
  }

  const tenantId = item.tenantId;
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new ApiError(404, "NOT_FOUND", "Tenant not found.");
  }

  return tenantId;
}

export async function listPublicCourses(
  tenantCode: string,
  q?: string,
  limitRaw?: number,
  cursor?: string
): Promise<PublicCoursesListResult> {
  if (testPublicCoursesListOverride) {
    return testPublicCoursesListOverride(tenantCode, q, limitRaw, cursor);
  }
  const normalizedTenantCode = normalizeTenantCode(tenantCode);
  await resolveTenantIdByCode(normalizedTenantCode);
  const limit = parsePublicListLimit(limitRaw);
  const out = await sendDdb<{ Items?: unknown[]; LastEvaluatedKey?: Record<string, unknown> }>(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :gsi2pk",
      ExpressionAttributeValues: {
        ":gsi2pk": `TENANTCODE#${normalizedTenantCode}#COURSES`
      },
      ExclusiveStartKey: cursor ? decodePublicListCursor(cursor) : undefined,
      ScanIndexForward: true,
      Limit: limit
    })
  );

  const keyword = q?.trim().toLowerCase();
  const rows = (out.Items ?? [])
    .map((i) => i as Record<string, unknown>)
    .filter((item) => isValidPublicProjection(item, normalizedTenantCode));
  const filtered = keyword
    ? rows.filter((item) => {
        const haystack = `${String(item.title ?? "")} ${String(item.shortDescription ?? "")} ${String(
          item.fullDescription ?? ""
        )}`.toLowerCase();
        return haystack.includes(keyword);
      })
    : rows;

  return {
    data: await Promise.all(filtered.map(publicCourseFromItem)),
    page: {
      limit,
      nextCursor: encodePublicListCursor(out.LastEvaluatedKey as Record<string, unknown> | undefined)
    }
  };
}

export async function getPublicCourseDetail(
  tenantCode: string,
  courseId: string
): Promise<PublicCourseDetail> {
  if (testPublicCourseDetailOverride) {
    return testPublicCourseDetailOverride(tenantCode, courseId);
  }
  const normalizedTenantCode = normalizeTenantCode(tenantCode);
  const tenantId = await resolveTenantIdByCode(normalizedTenantCode);
  const out = await sendDdb<{ Item?: Record<string, unknown> }>(
    new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPk(tenantId), SK: coursePublicSk(courseId) }
    })
  );

  if (!out.Item) throw new ApiError(404, "NOT_FOUND", "Course not found.");
  const item = out.Item as Record<string, unknown>;
  if (!isValidPublicProjection(item, normalizedTenantCode)) {
    throw new ApiError(404, "NOT_FOUND", "Course not found.");
  }
  return publicCourseDetailFromItem(item);
}

export async function reconcilePublicProjectionsForTenant(
  tenantId: string
): Promise<{ upserted: number; deleted: number }> {
  const tenantCode = await resolveTenantCodeById(tenantId);
  const courses = await listCourses(tenantId);
  let upserted = 0;
  let deleted = 0;

  for (const course of courses) {
    if (course.status === "published" && course.publicVisible) {
      await sendDdb(
        new PutCommand({
          TableName: tableName,
          Item: await buildPublicProjectionItem(course, tenantCode)
        })
      );
      upserted += 1;
    } else {
      await deletePublicProjection(tenantId, course.id);
      deleted += 1;
    }
  }

  return { upserted, deleted };
}

export const __coursesTestHooks = {
  setGetCourseOverride(loader: ((tenantId: string, courseId: string) => Promise<Course>) | null): void {
    testGetCourseOverride = loader;
  },
  setListCoursesOverride(loader: ((tenantId: string, input?: ListCoursesInput) => Promise<Course[]>) | null): void {
    testListCoursesOverride = loader;
  },
  setPublicCoursesListOverride(
    loader:
      | ((tenantCode: string, q?: string, limitRaw?: number, cursor?: string) => Promise<PublicCoursesListResult>)
      | null
  ): void {
    testPublicCoursesListOverride = loader;
  },
  setPublicCourseDetailOverride(
    loader: ((tenantCode: string, courseId: string) => Promise<PublicCourseDetail>) | null
  ): void {
    testPublicCourseDetailOverride = loader;
  },
  setResolveTenantIdByCodeOverride(loader: ((tenantCode: string) => Promise<string>) | null): void {
    testResolveTenantIdByCodeOverride = loader;
  },
  setDdbSendOverride(loader: ((command: object) => Promise<unknown>) | null): void {
    testDdbSendOverride = loader;
  },
  reset(): void {
    testGetCourseOverride = null;
    testListCoursesOverride = null;
    testPublicCoursesListOverride = null;
    testPublicCourseDetailOverride = null;
    testResolveTenantIdByCodeOverride = null;
    testDdbSendOverride = null;
  }
};
