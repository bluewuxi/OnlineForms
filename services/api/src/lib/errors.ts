export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "CAPTCHA_FAILED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: Array<{ field?: string; issue: string }>;
  /** Optional seconds until the client may retry (used by 429 responses). */
  public readonly retryAfter?: number;
  /** Per-field validation errors (used by 422 VALIDATION_ERROR responses). */
  public readonly fields?: Array<{ fieldId: string; error: string }>;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?: Array<{ field?: string; issue: string }>,
    retryAfter?: number,
    fields?: Array<{ fieldId: string; error: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
    this.fields = fields;
  }
}

