type AuthMetricName =
  | "InvalidTokenCount"
  | "TenantMismatchCount"
  | "RoleDeniedCount"
  | "MembershipDeniedCount";

type AuthAuditEvent =
  | "auth_authenticated"
  | "auth_invalid_token"
  | "auth_membership_denied"
  | "auth_membership_granted"
  | "auth_role_denied"
  | "auth_tenant_mismatch";

const serviceName = process.env.SERVICE_NAME ?? "onlineforms-api";

function emitMetric(metricName: AuthMetricName, value = 1): void {
  const metricEnvelope = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: "OnlineForms/Auth",
          Dimensions: [["Service"]],
          Metrics: [{ Name: metricName, Unit: "Count" }]
        }
      ]
    },
    Service: serviceName,
    [metricName]: value
  };
  console.log(JSON.stringify(metricEnvelope));
}

export function emitInvalidTokenMetric(): void {
  emitMetric("InvalidTokenCount", 1);
}

export function emitTenantMismatchMetric(): void {
  emitMetric("TenantMismatchCount", 1);
}

export function emitRoleDeniedMetric(): void {
  emitMetric("RoleDeniedCount", 1);
}

export function emitMembershipDeniedMetric(): void {
  emitMetric("MembershipDeniedCount", 1);
}

export function logAuthAudit(event: AuthAuditEvent, details: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      type: "auth_audit",
      event,
      service: serviceName,
      timestamp: new Date().toISOString(),
      ...details
    })
  );
}
