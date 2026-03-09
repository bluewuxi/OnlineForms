import { randomUUID } from "crypto";

export type HeaderMap = Record<string, string | undefined> | undefined;

export type CorrelationContext = {
  requestId: string;
  correlationId: string;
};

function pickHeader(headers: HeaderMap, key: string): string | undefined {
  if (!headers) return undefined;
  const hit = Object.entries(headers).find(
    ([name, value]) => name.toLowerCase() === key.toLowerCase() && typeof value === "string"
  );
  return hit?.[1];
}

export function resolveCorrelationId(headers: HeaderMap, requestId?: string): string {
  const incoming = pickHeader(headers, "x-correlation-id")?.trim();
  if (incoming && incoming.length <= 128) {
    return incoming;
  }
  return requestId ?? randomUUID();
}

export function createCorrelationContext(
  requestId: string,
  headers?: Record<string, string | undefined>
): CorrelationContext {
  return {
    requestId,
    correlationId: resolveCorrelationId(headers, requestId)
  };
}

