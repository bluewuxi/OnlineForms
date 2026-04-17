import { randomUUID } from "crypto";
import Stripe = require("stripe");
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { ApiError } from "./errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export type Payment = {
  id: string;
  tenantId: string;
  submissionId: string | null;
  courseId: string;
  variantId: string;
  amount: number;                  // minor units (cents)
  currency: string;                // ISO 4217 lowercase, e.g. "aud"
  status: PaymentStatus;
  stripePaymentIntentId: string;
  stripeChargeId: string | null;
  // Connect migration fields — null until Connect is enabled
  stripeAccountId: string | null;
  applicationFeeAmount: number | null;
  refundedAmount: number;          // minor units; 0 until refunded
  createdAt: string;
  updatedAt: string;
};

export type CreatePaymentRecordInput = {
  tenantId: string;
  courseId: string;
  variantId: string;
  amount: number;
  currency: string;
  stripePaymentIntentId: string;
  stripeAccountId: string;
  applicationFeeAmount: number;
};

export type RefundResult = {
  refundId: string;
  amount: number;
  currency: string;
  status: "refunded";
};

// ---------------------------------------------------------------------------
// DynamoDB client
// ---------------------------------------------------------------------------

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const paymentsTable = process.env.ONLINEFORMS_PAYMENTS_TABLE ?? "OnlineFormsPayments";

// ---------------------------------------------------------------------------
// SSM client — for runtime key fetching
// ---------------------------------------------------------------------------

const ssm = new SSMClient({});

// In-process cache: survives across invocations on a warm Lambda instance.
// Key rotation: update SSM then trigger a cold start (deploy, or simply wait
// for the Lambda to recycle). No redeployment of CloudFormation needed.
let _cachedSecretKey: string | null = null;
let _cachedWebhookSecret: string | null = null;

async function fetchSsmParameter(path: string): Promise<string> {
  const result = await ssm.send(new GetParameterCommand({ Name: path, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new ApiError(500, "CONFIGURATION_ERROR", `SSM parameter ${path} is empty or missing.`);
  return value;
}

async function getStripeSecretKey(): Promise<string> {
  if (_cachedSecretKey) return _cachedSecretKey;
  const path = process.env.STRIPE_SECRET_KEY_PATH ?? "/onlineforms/stripe/secret-key";
  _cachedSecretKey = await fetchSsmParameter(path);
  return _cachedSecretKey;
}

async function getWebhookSecret(): Promise<string> {
  if (_cachedWebhookSecret) return _cachedWebhookSecret;
  const path = process.env.STRIPE_WEBHOOK_SECRET_PATH ?? "/onlineforms/stripe/webhook-secret";
  _cachedWebhookSecret = await fetchSsmParameter(path);
  return _cachedWebhookSecret;
}

// ---------------------------------------------------------------------------
// Stripe client (lazy async — built after SSM fetch on first use)
// ---------------------------------------------------------------------------

type StripeInstance = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeInstance["webhooks"]["constructEvent"]>;

let _stripe: StripeInstance | null = null;

async function getStripe(): Promise<StripeInstance> {
  if (_stripe) return _stripe;
  const key = await getStripeSecretKey();
  _stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
  return _stripe;
}

// ---------------------------------------------------------------------------
// Test overrides
// ---------------------------------------------------------------------------

let testDdbSendOverride: ((command: object) => Promise<Record<string, unknown>>) | null = null;
let testStripeOverride: {
  createPaymentIntent?: (amount: number, currency: string, metadata: Record<string, string>, stripeAccountId: string, applicationFeeAmount: number) => Promise<{ id: string; client_secret: string }>;
  retrievePaymentIntent?: (id: string) => Promise<{ id: string; status: string; latest_charge: string | null }>;
  createRefund?: (paymentIntentId: string) => Promise<{ id: string; amount: number; currency: string }>;
} | null = null;

async function sendDdb(command: object): Promise<Record<string, unknown>> {
  if (testDdbSendOverride) return testDdbSendOverride(command);
  return (await ddb.send(command as never)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// DynamoDB key helpers
// ---------------------------------------------------------------------------

function tenantPk(tenantId: string): string {
  return `TENANT#${tenantId}`;
}

function paymentSk(paymentId: string): string {
  return `PAYMENT#${paymentId}`;
}

// GSI1: lookup by submissionId
function gsi1Pk(submissionId: string): string {
  return `SUBMISSION#${submissionId}`;
}

// GSI2: lookup by Stripe PaymentIntent id
function gsi2Pk(stripePaymentIntentId: string): string {
  return `STRIPE_PI#${stripePaymentIntentId}`;
}

// ---------------------------------------------------------------------------
// Item mapper
// ---------------------------------------------------------------------------

function fromItem(item: Record<string, unknown>): Payment {
  return {
    id: item.paymentId as string,
    tenantId: item.tenantId as string,
    submissionId: (item.submissionId as string | null) ?? null,
    courseId: item.courseId as string,
    variantId: item.variantId as string,
    amount: item.amount as number,
    currency: item.currency as string,
    status: item.status as PaymentStatus,
    stripePaymentIntentId: item.stripePaymentIntentId as string,
    stripeChargeId: (item.stripeChargeId as string | null) ?? null,
    stripeAccountId: (item.stripeAccountId as string | null) ?? null,
    applicationFeeAmount: (item.applicationFeeAmount as number | null) ?? null,
    refundedAmount: (item.refundedAmount as number) ?? 0,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string
  };
}

// ---------------------------------------------------------------------------
// Stripe wrappers
// ---------------------------------------------------------------------------

export async function createStripePaymentIntent(
  amount: number,
  currency: string,
  metadata: Record<string, string>,
  stripeAccountId: string,
  applicationFeeAmount: number
): Promise<{ id: string; clientSecret: string }> {
  if (testStripeOverride?.createPaymentIntent) {
    const result = await testStripeOverride.createPaymentIntent(amount, currency, metadata, stripeAccountId, applicationFeeAmount);
    return { id: result.id, clientSecret: result.client_secret };
  }
  const stripe = await getStripe();
  const pi = await stripe.paymentIntents.create({
    amount,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
    application_fee_amount: applicationFeeAmount,
    transfer_data: { destination: stripeAccountId }
  });
  if (!pi.client_secret) {
    throw new ApiError(500, "STRIPE_ERROR", "Stripe did not return a client secret.");
  }
  return { id: pi.id, clientSecret: pi.client_secret };
}

export async function retrieveStripePaymentIntent(
  stripePaymentIntentId: string
): Promise<{ id: string; status: string; latestCharge: string | null }> {
  if (testStripeOverride?.retrievePaymentIntent) {
    const result = await testStripeOverride.retrievePaymentIntent(stripePaymentIntentId);
    return { id: result.id, status: result.status, latestCharge: result.latest_charge };
  }
  const stripe = await getStripe();
  const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
  return {
    id: pi.id,
    status: pi.status,
    latestCharge: typeof pi.latest_charge === "string" ? pi.latest_charge : null
  };
}

export async function createStripeRefund(
  stripePaymentIntentId: string,
  options: { reverseTransfer?: boolean; refundApplicationFee?: boolean } = {}
): Promise<{ id: string; amount: number; currency: string }> {
  if (testStripeOverride?.createRefund) {
    return testStripeOverride.createRefund(stripePaymentIntentId);
  }
  const stripe = await getStripe();
  const refund = await stripe.refunds.create({
    payment_intent: stripePaymentIntentId,
    ...(options.reverseTransfer && { reverse_transfer: true }),
    ...(options.refundApplicationFee && { refund_application_fee: true })
  });
  return { id: refund.id, amount: refund.amount, currency: refund.currency };
}

export async function verifyStripeWebhookSignature(
  payload: string,
  signature: string
): Promise<StripeEvent> {
  const [secret, stripe] = await Promise.all([getWebhookSecret(), getStripe()]);
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    throw new ApiError(400, "INVALID_SIGNATURE", "Stripe webhook signature verification failed.");
  }
}

// ---------------------------------------------------------------------------
// DynamoDB CRUD
// ---------------------------------------------------------------------------

export async function createPaymentRecord(input: CreatePaymentRecordInput): Promise<Payment> {
  const now = new Date().toISOString();
  const paymentId = `pay_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

  const item = {
    PK: tenantPk(input.tenantId),
    SK: paymentSk(paymentId),
    GSI1PK: gsi1Pk("NONE"),              // updated to real submissionId after enrollment
    GSI1SK: paymentSk(paymentId),
    GSI2PK: gsi2Pk(input.stripePaymentIntentId),
    GSI2SK: paymentSk(paymentId),
    entityType: "PAYMENT",
    paymentId,
    tenantId: input.tenantId,
    submissionId: null,
    courseId: input.courseId,
    variantId: input.variantId,
    amount: input.amount,
    currency: input.currency,
    status: "pending" as PaymentStatus,
    stripePaymentIntentId: input.stripePaymentIntentId,
    stripeChargeId: null,
    stripeAccountId: input.stripeAccountId,
    applicationFeeAmount: input.applicationFeeAmount,
    refundedAmount: 0,
    createdAt: now,
    updatedAt: now
  };

  await sendDdb(new PutCommand({ TableName: paymentsTable, Item: item }));
  return fromItem(item as Record<string, unknown>);
}

export async function getPaymentByIntentId(
  stripePaymentIntentId: string
): Promise<Payment | null> {
  const result = await sendDdb(
    new QueryCommand({
      TableName: paymentsTable,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": gsi2Pk(stripePaymentIntentId) },
      Limit: 1
    })
  );
  const items = (result.Items as Record<string, unknown>[] | undefined) ?? [];
  return items.length > 0 ? fromItem(items[0]) : null;
}

export async function getPaymentBySubmissionId(
  submissionId: string
): Promise<Payment | null> {
  const result = await sendDdb(
    new QueryCommand({
      TableName: paymentsTable,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": gsi1Pk(submissionId) },
      Limit: 1
    })
  );
  const items = (result.Items as Record<string, unknown>[] | undefined) ?? [];
  return items.length > 0 ? fromItem(items[0]) : null;
}

export async function getPaymentById(tenantId: string, paymentId: string): Promise<Payment | null> {
  const result = await sendDdb(
    new GetCommand({
      TableName: paymentsTable,
      Key: { PK: tenantPk(tenantId), SK: paymentSk(paymentId) }
    })
  );
  if (!result.Item) return null;
  return fromItem(result.Item as Record<string, unknown>);
}

export async function updatePaymentRecord(
  tenantId: string,
  paymentId: string,
  patch: {
    status?: PaymentStatus;
    submissionId?: string;
    stripeChargeId?: string;
    refundedAmount?: number;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":updatedAt": now };
  const sets: string[] = ["#updatedAt = :updatedAt"];

  if (patch.status !== undefined) {
    names["#status"] = "status";
    values[":status"] = patch.status;
    sets.push("#status = :status");
  }
  if (patch.submissionId !== undefined) {
    names["#submissionId"] = "submissionId";
    names["#GSI1PK"] = "GSI1PK";
    values[":submissionId"] = patch.submissionId;
    values[":gsi1pk"] = gsi1Pk(patch.submissionId);
    sets.push("#submissionId = :submissionId", "#GSI1PK = :gsi1pk");
  }
  if (patch.stripeChargeId !== undefined) {
    names["#stripeChargeId"] = "stripeChargeId";
    values[":stripeChargeId"] = patch.stripeChargeId;
    sets.push("#stripeChargeId = :stripeChargeId");
  }
  if (patch.refundedAmount !== undefined) {
    names["#refundedAmount"] = "refundedAmount";
    values[":refundedAmount"] = patch.refundedAmount;
    sets.push("#refundedAmount = :refundedAmount");
  }

  await sendDdb(
    new UpdateCommand({
      TableName: paymentsTable,
      Key: { PK: tenantPk(tenantId), SK: paymentSk(paymentId) },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values
    })
  );
}

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

export const __paymentsTestHooks = {
  setDdbSendOverride(fn: ((command: object) => Promise<Record<string, unknown>>) | null): void {
    testDdbSendOverride = fn;
  },
  setStripeOverride(overrides: typeof testStripeOverride): void {
    testStripeOverride = overrides;
  },
  /** Force-replace the internal Stripe singleton (for advanced mocking). */
  setStripeInstance(instance: StripeInstance | null): void {
    _stripe = instance;
  },
  reset(): void {
    testDdbSendOverride = null;
    testStripeOverride = null;
    _stripe = null;
    _cachedSecretKey = null;
    _cachedWebhookSecret = null;
  }
};
