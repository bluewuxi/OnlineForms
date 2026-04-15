import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  __paymentsTestHooks,
  createPaymentRecord,
  getPaymentByIntentId,
  getPaymentBySubmissionId,
  updatePaymentRecord
} from "../services/api/src/lib/payments";
import { __coursesTestHooks } from "../services/api/src/lib/courses";
import { __formSchemasTestHooks } from "../services/api/src/lib/formSchemas";
import {
  __submissionsTestHooks,
  createPublicEnrollment
} from "../services/api/src/lib/submissions";

test.afterEach(() => {
  __paymentsTestHooks.reset();
  __coursesTestHooks.reset();
  __submissionsTestHooks.reset();
  __formSchemasTestHooks.reset();
});

// ---------------------------------------------------------------------------
// createPaymentRecord
// ---------------------------------------------------------------------------

test("createPaymentRecord writes a pending PAYMENT item to the payments table", async () => {
  const commands: object[] = [];
  __paymentsTestHooks.setDdbSendOverride(async (command) => {
    commands.push(command);
    if (command instanceof PutCommand) return {};
    return {};
  });

  const payment = await createPaymentRecord({
    tenantId: "ten_001",
    courseId: "crs_001",
    variantId: "var_001",
    amount: 5000,
    currency: "aud",
    stripePaymentIntentId: "pi_test_123"
  });

  assert.equal(payment.status, "pending");
  assert.equal(payment.amount, 5000);
  assert.equal(payment.currency, "aud");
  assert.equal(payment.stripePaymentIntentId, "pi_test_123");
  assert.equal(payment.submissionId, null);
  assert.equal(payment.refundedAmount, 0);
  assert.equal(payment.stripeAccountId, null);
  assert.ok(payment.id.startsWith("pay_"));

  assert.equal(commands.length, 1);
  const putCmd = commands[0] as PutCommand;
  assert.equal(putCmd.input.TableName, "OnlineFormsPayments");
  assert.equal((putCmd.input.Item as Record<string, unknown>).entityType, "PAYMENT");
  assert.equal((putCmd.input.Item as Record<string, unknown>).status, "pending");
  assert.equal((putCmd.input.Item as Record<string, unknown>).GSI2PK, "STRIPE_PI#pi_test_123");
  // GSI1 uses NONE as placeholder until submission is linked
  assert.equal((putCmd.input.Item as Record<string, unknown>).GSI1PK, "SUBMISSION#NONE");
});

// ---------------------------------------------------------------------------
// getPaymentByIntentId
// ---------------------------------------------------------------------------

test("getPaymentByIntentId queries GSI2 and returns the payment", async () => {
  const mockItem = {
    paymentId: "pay_abc",
    tenantId: "ten_001",
    submissionId: null,
    courseId: "crs_001",
    variantId: "var_001",
    amount: 5000,
    currency: "aud",
    status: "pending",
    stripePaymentIntentId: "pi_test_123",
    stripeChargeId: null,
    stripeAccountId: null,
    applicationFeeAmount: null,
    refundedAmount: 0,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z"
  };

  __paymentsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof QueryCommand) {
      return { Items: [mockItem] };
    }
    return {};
  });

  const result = await getPaymentByIntentId("pi_test_123");
  assert.ok(result !== null);
  assert.equal(result.id, "pay_abc");
  assert.equal(result.status, "pending");
  assert.equal(result.amount, 5000);
});

test("getPaymentByIntentId returns null when no matching record", async () => {
  __paymentsTestHooks.setDdbSendOverride(async () => ({ Items: [] }));
  const result = await getPaymentByIntentId("pi_nonexistent");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// getPaymentBySubmissionId
// ---------------------------------------------------------------------------

test("getPaymentBySubmissionId queries GSI1 by submissionId", async () => {
  const mockItem = {
    paymentId: "pay_abc",
    tenantId: "ten_001",
    submissionId: "sub_001",
    courseId: "crs_001",
    variantId: "var_001",
    amount: 5000,
    currency: "aud",
    status: "succeeded",
    stripePaymentIntentId: "pi_test_123",
    stripeChargeId: "ch_test_456",
    stripeAccountId: null,
    applicationFeeAmount: null,
    refundedAmount: 0,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z"
  };

  __paymentsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof QueryCommand) {
      assert.equal(
        (command as QueryCommand).input.ExpressionAttributeValues?.[":pk"],
        "SUBMISSION#sub_001"
      );
      return { Items: [mockItem] };
    }
    return {};
  });

  const result = await getPaymentBySubmissionId("sub_001");
  assert.ok(result !== null);
  assert.equal(result.submissionId, "sub_001");
  assert.equal(result.status, "succeeded");
});

// ---------------------------------------------------------------------------
// updatePaymentRecord
// ---------------------------------------------------------------------------

test("updatePaymentRecord updates status, submissionId, and GSI1PK atomically", async () => {
  let capturedUpdate: UpdateCommand | null = null;
  __paymentsTestHooks.setDdbSendOverride(async (command) => {
    if (command instanceof UpdateCommand) {
      capturedUpdate = command as UpdateCommand;
      return {};
    }
    return {};
  });

  await updatePaymentRecord("ten_001", "pay_abc", {
    status: "succeeded",
    submissionId: "sub_999",
    stripeChargeId: "ch_test_789"
  });

  assert.ok(capturedUpdate !== null);
  const u = capturedUpdate as UpdateCommand;
  assert.equal(u.input.TableName, "OnlineFormsPayments");
  assert.equal(u.input.ExpressionAttributeValues?.[":status"], "succeeded");
  assert.equal(u.input.ExpressionAttributeValues?.[":submissionId"], "sub_999");
  assert.equal(u.input.ExpressionAttributeValues?.[":gsi1pk"], "SUBMISSION#sub_999");
  assert.equal(u.input.ExpressionAttributeValues?.[":stripeChargeId"], "ch_test_789");
});

// ---------------------------------------------------------------------------
// createPublicEnrollment — payment validation
// ---------------------------------------------------------------------------

function makePaidCourseDetail() {
  return {
    id: "crs_001",
    title: "Paid Course",
    shortDescription: "A paid course",
    imageUrl: null,
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    deliveryMode: "online" as const,
    pricingMode: "paid_placeholder" as const,
    locationText: null,
    enrollmentOpenAt: "2026-04-01T00:00:00Z",
    enrollmentCloseAt: "2026-04-30T23:59:59Z",
    enrollmentOpenNow: true,
    enrollmentStatus: "open" as const,
    links: {
      detail: "/v1/public/ten-a/courses/crs_001",
      enrollmentForm: "/v1/public/ten-a/courses/crs_001/form"
    },
    fullDescription: "Full description",
    capacity: 30,
    formAvailable: true,
    formVersion: 1,
    formSchema: { version: 1, fields: [] },
    variants: [
      {
        id: "var_001",
        title: "Morning Session",
        description: null,
        startDate: "2026-05-01",
        endDate: "2026-05-31",
        deliveryMode: "online" as const,
        locationText: null,
        capacity: 30,
        price: 5000,   // $50.00 AUD in cents
        displayOrder: 1
      }
    ]
  };
}

test("createPublicEnrollment rejects paid variant without paymentIntentId", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => makePaidCourseDetail());

  await assert.rejects(
    () =>
      createPublicEnrollment("ten-a", "crs_001", randomUUID(), {
        formVersion: 1,
        answers: {},
        variantId: "var_001"
        // paymentIntentId deliberately omitted
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /paymentIntentId is required/i);
      return true;
    }
  );
});

test("createPublicEnrollment rejects paymentIntentId whose status is not succeeded", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => makePaidCourseDetail());
  __paymentsTestHooks.setStripeOverride({
    retrievePaymentIntent: async () => ({ id: "pi_test_pending", status: "requires_payment_method", latest_charge: null })
  });

  await assert.rejects(
    () =>
      createPublicEnrollment("ten-a", "crs_001", randomUUID(), {
        formVersion: 1,
        answers: {},
        variantId: "var_001",
        paymentIntentId: "pi_test_pending"
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Payment has not been completed/i);
      return true;
    }
  );
});

test("createPublicEnrollment rejects paymentIntentId on a free course", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => ({
    ...makePaidCourseDetail(),
    variants: [{ ...makePaidCourseDetail().variants[0], price: null }]
  }));

  await assert.rejects(
    () =>
      createPublicEnrollment("ten-a", "crs_001", randomUUID(), {
        formVersion: 1,
        answers: {},
        variantId: "var_001",
        paymentIntentId: "pi_test_xyz"
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /not applicable for free/i);
      return true;
    }
  );
});

test("createPublicEnrollment succeeds for paid variant and links payment record", async () => {
  __coursesTestHooks.setResolveTenantIdByCodeOverride(async () => "ten_001");
  __coursesTestHooks.setPublicCourseDetailOverride(async () => makePaidCourseDetail());
  __formSchemasTestHooks.setGetCourseFormSchemaVersionOverride(async () => ({
    formId: "frm_001",
    version: 1,
    tenantId: "ten_001",
    courseId: "crs_001",
    status: "active",
    fields: [],
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z"
  }));
  __paymentsTestHooks.setStripeOverride({
    retrievePaymentIntent: async () => ({
      id: "pi_test_success",
      status: "succeeded",
      latest_charge: "ch_test_001"
    })
  });

  const ddbCommands: object[] = [];
  const paymentQueryResult = {
    Items: [
      {
        paymentId: "pay_existing",
        tenantId: "ten_001",
        submissionId: null,
        courseId: "crs_001",
        variantId: "var_001",
        amount: 5000,
        currency: "aud",
        status: "pending",
        stripePaymentIntentId: "pi_test_success",
        stripeChargeId: null,
        stripeAccountId: null,
        applicationFeeAmount: null,
        refundedAmount: 0,
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z"
      }
    ]
  };
  __paymentsTestHooks.setDdbSendOverride(async (command) => {
    ddbCommands.push(command);
    if (command instanceof QueryCommand) return paymentQueryResult;
    if (command instanceof UpdateCommand) return {};
    return {};
  });
  __submissionsTestHooks.setDdbSendOverride(async (command) => {
    ddbCommands.push(command);
    // TransactWriteCommand mock — just succeed
    return {};
  });

  const result = await createPublicEnrollment("ten-a", "crs_001", randomUUID(), {
    formVersion: 1,
    answers: {},
    variantId: "var_001",
    paymentIntentId: "pi_test_success"
  });

  assert.equal(result.status, "submitted");
  assert.ok(result.submissionId.startsWith("sub_"));

  // Verify payment record was updated (UpdateCommand from payments lib)
  const updateCmds = ddbCommands.filter((c) => c instanceof UpdateCommand) as UpdateCommand[];
  assert.ok(updateCmds.length >= 1);
  const paymentUpdate = updateCmds.find(
    (c) => c.input.ExpressionAttributeValues?.[":stripeChargeId"] === "ch_test_001"
  );
  assert.ok(paymentUpdate, "Expected payment record update with stripeChargeId");
});
