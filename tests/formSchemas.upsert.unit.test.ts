import test from "node:test";
import assert from "node:assert/strict";
import { QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { __coursesTestHooks } from "../services/api/src/lib/courses";
import { __formSchemasTestHooks, upsertCourseFormSchema } from "../services/api/src/lib/formSchemas";

test.afterEach(() => {
  __coursesTestHooks.reset();
  __formSchemasTestHooks.reset();
});

test("upsertCourseFormSchema writes form version and course pointer in one transaction", async () => {
  __coursesTestHooks.setGetCourseOverride(async () => ({
    id: "crs_001",
    tenantId: "ten_001",
    title: "Intro to AI",
    shortDescription: "Foundations course",
    fullDescription: "Detailed syllabus",
    startDate: "2026-04-01",
    endDate: "2026-04-28",
    enrollmentOpenAt: "2026-03-10T00:00:00Z",
    enrollmentCloseAt: "2026-03-31T23:59:59Z",
    deliveryMode: "online",
    locationText: null,
    capacity: 120,
    status: "draft",
    publicVisible: false,
    pricingMode: "free",
    paymentEnabledFlag: false,
    imageAssetId: null,
    activeFormId: "frm_001",
    activeFormVersion: 1,
    createdAt: "2026-03-10T00:00:00Z",
    updatedAt: "2026-03-10T00:00:00Z",
    createdBy: "usr_001",
    updatedBy: "usr_001"
  }));

  const commands: object[] = [];
  __formSchemasTestHooks.setDdbSendOverride(async (command) => {
    commands.push(command);
    const commandName = (command as { constructor?: { name?: string } }).constructor?.name;
    if (commandName === "QueryCommand") {
      return {
        Items: [
          {
            version: 1,
            formId: "frm_001"
          }
        ]
      };
    }
    if (commandName === "TransactWriteCommand") {
      return {};
    }
    throw new Error(`Unexpected command: ${commandName}`);
  });

  const result = await upsertCourseFormSchema("ten_001", "crs_001", "usr_001", [
    {
      fieldId: "email",
      type: "email",
      label: "Email",
      required: true,
      displayOrder: 1
    }
  ]);

  assert.equal(result.formId, "frm_001");
  assert.equal(result.version, 2);
  assert.equal(commands.filter((command) => command instanceof QueryCommand).length, 1);
  assert.equal(commands.filter((command) => command instanceof TransactWriteCommand).length, 1);

  const transaction = commands.find((command) => command instanceof TransactWriteCommand) as TransactWriteCommand;
  const items = transaction.input.TransactItems ?? [];
  assert.equal(items.length, 2);
  assert.equal(items[0]?.Put?.Item?.version, 2);
  assert.equal(items[1]?.Update?.Key?.SK, "COURSE#crs_001");
});
