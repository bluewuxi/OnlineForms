import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../services/api/src/lib/errors";
import { validateFormFields, type FormField } from "../services/api/src/lib/formSchemas";

function asApiError(error: unknown): ApiError {
  assert.ok(error instanceof ApiError);
  return error;
}

function baseField(overrides?: Partial<FormField>): FormField {
  return {
    fieldId: "first_name",
    type: "short_text",
    label: "First Name",
    required: true,
    displayOrder: 1,
    ...overrides
  };
}

test("validateFormFields accepts valid field definitions", () => {
  const fields: FormField[] = [
    baseField(),
    baseField({
      fieldId: "email",
      type: "email",
      label: "Email",
      displayOrder: 2
    })
  ];
  assert.doesNotThrow(() => validateFormFields(fields));
});

test("validateFormFields rejects duplicate fieldId", () => {
  const fields: FormField[] = [
    baseField(),
    baseField({
      displayOrder: 2
    })
  ];
  assert.throws(
    () => validateFormFields(fields),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 400);
      assert.equal(apiError.code, "VALIDATION_ERROR");
      return true;
    }
  );
});

test("validateFormFields rejects missing options for select fields", () => {
  const fields: FormField[] = [
    baseField({
      fieldId: "topics",
      type: "multi_select",
      label: "Topics"
    })
  ];
  assert.throws(
    () => validateFormFields(fields),
    (error: unknown) => {
      const apiError = asApiError(error);
      assert.equal(apiError.statusCode, 400);
      assert.equal(apiError.code, "VALIDATION_ERROR");
      return true;
    }
  );
});
