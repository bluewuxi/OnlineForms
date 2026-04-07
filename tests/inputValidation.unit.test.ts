import test from "node:test";
import assert from "node:assert/strict";
import {
  stripHtmlTags,
  sanitizeAnswers
} from "../services/api/src/lib/submissions";
import type { FormField } from "../services/api/src/lib/formSchemas";

// ── stripHtmlTags ─────────────────────────────────────────────────────────────

test("stripHtmlTags removes simple HTML tags", () => {
  assert.equal(stripHtmlTags("<b>Hello</b>"), "Hello");
});

test("stripHtmlTags removes nested and multiple tags", () => {
  assert.equal(stripHtmlTags("<p><b>Hello</b> <i>world</i></p>"), "Hello world");
});

test("stripHtmlTags removes script tags (XSS protection)", () => {
  assert.equal(
    stripHtmlTags('<script>alert("xss")</script>ordinary text'),
    'alert("xss")ordinary text'
  );
});

test("stripHtmlTags leaves plain text unchanged", () => {
  assert.equal(stripHtmlTags("Hello, world!"), "Hello, world!");
});

test("stripHtmlTags handles empty string", () => {
  assert.equal(stripHtmlTags(""), "");
});

// ── sanitizeAnswers ───────────────────────────────────────────────────────────

const textField: FormField = {
  fieldId: "bio",
  type: "short_text",
  label: "Bio",
  required: false,
  displayOrder: 1
};

const emailField: FormField = {
  fieldId: "email",
  type: "email",
  label: "Email",
  required: true,
  displayOrder: 2
};

const longTextField: FormField = {
  fieldId: "notes",
  type: "long_text",
  label: "Notes",
  required: false,
  displayOrder: 3
};

test("sanitizeAnswers strips HTML from short_text fields", () => {
  const result = sanitizeAnswers([textField, emailField], {
    bio: "<b>Hello</b>",
    email: "test@example.com"
  });
  assert.equal(result["bio"], "Hello");
  assert.equal(result["email"], "test@example.com");
});

test("sanitizeAnswers strips HTML from long_text fields", () => {
  const result = sanitizeAnswers([longTextField], {
    notes: "<p>Some <b>bold</b> text</p>"
  });
  assert.equal(result["notes"], "Some bold text");
});

test("sanitizeAnswers does not strip non-text fields (email, select, etc.)", () => {
  const selectField: FormField = {
    fieldId: "level",
    type: "single_select",
    label: "Level",
    required: true,
    displayOrder: 4,
    options: [{ label: "Beginner", value: "beginner" }]
  };
  const result = sanitizeAnswers([selectField, emailField], {
    level: "<bogus>beginner</bogus>",
    email: "user@example.com"
  });
  // select field should not be modified
  assert.equal(result["level"], "<bogus>beginner</bogus>");
  assert.equal(result["email"], "user@example.com");
});

test("sanitizeAnswers returns new object, does not mutate original", () => {
  const original = { bio: "<em>test</em>" };
  const result = sanitizeAnswers([textField], original);
  assert.notStrictEqual(result, original);
  assert.equal(original["bio"], "<em>test</em>"); // original unchanged
  assert.equal(result["bio"], "test");
});

// ── maxLength default caps (tested via validateAnswersAgainstSchema implicitly) ─

test("sanitizeAnswers preserves non-string values in text-typed fields", () => {
  const result = sanitizeAnswers([textField], {
    bio: null
  });
  // null should remain null (not crashed)
  assert.equal(result["bio"], null);
});
