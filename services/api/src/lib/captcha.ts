import { ApiError } from "./errors";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 3000;

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

let testVerifyOverride:
  | ((token: string, remoteip: string) => Promise<boolean>)
  | null = null;

/**
 * Verifies a Cloudflare Turnstile CAPTCHA token server-side.
 *
 * - Skips verification entirely when TURNSTILE_ENABLED=false (local/test).
 * - On Cloudflare API timeout (>3s), logs a warning and allows the submission
 *   through — real users should not be blocked by Cloudflare downtime.
 * - Throws 403 CAPTCHA_FAILED if the token is invalid or missing.
 */
export async function verifyCaptcha(token: string | undefined, remoteip: string): Promise<void> {
  if (process.env.TURNSTILE_ENABLED === "false") {
    return;
  }

  if (testVerifyOverride) {
    const success = await testVerifyOverride(token ?? "", remoteip);
    if (!success) {
      throw new ApiError(
        403,
        "CAPTCHA_FAILED",
        "CAPTCHA verification failed. Please reload and try again."
      );
    }
    return;
  }

  if (!token) {
    throw new ApiError(
      403,
      "CAPTCHA_FAILED",
      "CAPTCHA verification failed. Please reload and try again."
    );
  }

  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip }),
      signal: controller.signal
    });

    const result = (await response.json()) as TurnstileVerifyResponse;

    if (!result.success) {
      throw new ApiError(
        403,
        "CAPTCHA_FAILED",
        "CAPTCHA verification failed. Please reload and try again."
      );
    }
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    // AbortError = timeout; any other fetch-level error is treated the same:
    // log the issue and allow the submission through so real users are not blocked.
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    console.warn(
      JSON.stringify({
        type: "captcha_verify_warning",
        message: isTimeout
          ? "Cloudflare Turnstile verify timed out — allowing submission through"
          : "Cloudflare Turnstile verify failed with network error — allowing submission through",
        error: err instanceof Error ? err.message : String(err)
      })
    );
    // Allow through on timeout / network failure
  } finally {
    clearTimeout(timeoutId);
  }
}

export const __captchaTestHooks = {
  setVerifyOverride(fn: ((token: string, remoteip: string) => Promise<boolean>) | null): void {
    testVerifyOverride = fn;
  },
  reset(): void {
    testVerifyOverride = null;
    delete process.env.TURNSTILE_ENABLED;
  }
};
