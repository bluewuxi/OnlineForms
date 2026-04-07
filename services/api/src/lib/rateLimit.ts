import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./errors";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 3_600_000; // 1 hour in milliseconds

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.ONLINEFORMS_RATE_LIMIT_TABLE ?? "OnlineFormsRateLimit";

let testDdbSendOverride:
  | ((command: object) => Promise<Record<string, unknown>>)
  | null = null;

async function sendDdb(command: object): Promise<Record<string, unknown>> {
  if (testDdbSendOverride) {
    return testDdbSendOverride(command);
  }
  return (await ddb.send(command as never)) as Record<string, unknown>;
}

/** Returns the number of seconds until the next hour bucket boundary. */
function secondsUntilNextHour(): number {
  const now = Date.now();
  const nextBoundary = (Math.floor(now / RATE_LIMIT_WINDOW_MS) + 1) * RATE_LIMIT_WINDOW_MS;
  return Math.ceil((nextBoundary - now) / 1000);
}

/**
 * Checks and increments the rate limit counter for a given IP address.
 *
 * Uses a DynamoDB atomic ADD + conditional expression to ensure the counter
 * never exceeds RATE_LIMIT_MAX within the current hour bucket.
 *
 * Throws a 429 ApiError if the limit is already reached.
 * Skips rate limiting entirely when AUTH_MODE=mock (local dev).
 */
export async function checkRateLimit(ip: string): Promise<void> {
  if (process.env.AUTH_MODE === "mock") {
    return;
  }

  const hourBucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  const pk = `RATELIMIT#${ip}#${hourBucket}`;

  // TTL: expire 2 hours from the start of the current hour bucket (Unix seconds)
  const currentHourBoundaryMs = hourBucket * RATE_LIMIT_WINDOW_MS;
  const expiresAt = Math.floor((currentHourBoundaryMs + 2 * RATE_LIMIT_WINDOW_MS) / 1000);

  try {
    await sendDdb(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk },
        UpdateExpression:
          "ADD #count :one SET #expiresAt = if_not_exists(#expiresAt, :expiresAt)",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: {
          "#count": "count",
          "#expiresAt": "expiresAt"
        },
        ExpressionAttributeValues: {
          ":one": 1,
          ":limit": RATE_LIMIT_MAX,
          ":expiresAt": expiresAt
        }
      })
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ConditionalCheckFailedException") {
      const retryAfter = secondsUntilNextHour();
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Too many submissions. Please try again later.",
        undefined,
        retryAfter
      );
    }
    throw err;
  }
}

export const __rateLimitTestHooks = {
  setDdbSendOverride(fn: ((command: object) => Promise<Record<string, unknown>>) | null): void {
    testDdbSendOverride = fn;
  },
  reset(): void {
    testDdbSendOverride = null;
  }
};
