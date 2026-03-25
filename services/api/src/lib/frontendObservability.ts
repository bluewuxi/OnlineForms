type FrontendMetricName =
  | "AssetUploadTicketCreateCount"
  | "BrandingUpdateCount"
  | "PublicEnrollmentCreateCount";

type FrontendAuditEvent =
  | "frontend_asset_upload_ticket_created"
  | "frontend_branding_updated"
  | "frontend_public_enrollment_created";

const serviceName = process.env.SERVICE_NAME ?? "onlineforms-api";

function emitMetric(metricName: FrontendMetricName, value = 1): void {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "OnlineForms/Frontend",
            Dimensions: [["Service"]],
            Metrics: [{ Name: metricName, Unit: "Count" }]
          }
        ]
      },
      Service: serviceName,
      [metricName]: value
    })
  );
}

export function emitAssetUploadTicketCreateMetric(): void {
  emitMetric("AssetUploadTicketCreateCount", 1);
}

export function emitBrandingUpdateMetric(): void {
  emitMetric("BrandingUpdateCount", 1);
}

export function emitPublicEnrollmentCreateMetric(): void {
  emitMetric("PublicEnrollmentCreateCount", 1);
}

export function logFrontendAudit(event: FrontendAuditEvent, details: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      type: "frontend_audit",
      event,
      service: serviceName,
      timestamp: new Date().toISOString(),
      ...details
    })
  );
}
