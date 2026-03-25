import test from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { handler as getAssetHandler } from "../services/api/src/handlers/orgAssetsGet";
import { handler as uploadTicketHandler } from "../services/api/src/handlers/orgAssetsUploadTicketCreate";
import { handler as brandingHandler } from "../services/api/src/handlers/orgTenantBrandingUpdate";
import { __assetsTestHooks } from "../services/api/src/lib/assets";
import { __tenantsTestHooks } from "../services/api/src/lib/tenants";

function asStructuredResult(
  result: Awaited<ReturnType<typeof getAssetHandler>>
): APIGatewayProxyStructuredResultV2 {
  if (!result || typeof result === "string") throw new Error("Expected structured lambda response.");
  return result;
}

function baseContext(path: string, method: string, requestId: string) {
  return {
    accountId: "123456789012",
    apiId: "api",
    domainName: "example.com",
    domainPrefix: "example",
    http: {
      method,
      path,
      protocol: "HTTP/1.1",
      sourceIp: "127.0.0.1",
      userAgent: "node-test"
    },
    requestId,
    routeKey: `${method} ${path}`,
    stage: "v1",
    time: "10/Mar/2026:00:00:00 +0000",
    timeEpoch: 0
  };
}

test("orgAssetsGet returns 400 when assetId path is missing", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "GET /org/assets/{assetId}",
      rawPath: "/org/assets/",
      rawQueryString: "",
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/assets/{assetId}", "GET", "req_asset_get"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await getAssetHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgAssetsUploadTicketCreate returns 400 on missing body", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "POST /org/assets/upload-ticket",
      rawPath: "/org/assets/upload-ticket",
      rawQueryString: "",
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/assets/upload-ticket", "POST", "req_asset_ticket"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await uploadTicketHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantBrandingUpdate returns 400 on missing body", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  try {
    const event = {
      version: "2.0",
      routeKey: "PATCH /org/branding",
      rawPath: "/org/branding",
      rawQueryString: "",
      headers: {
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/branding", "PATCH", "req_branding"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await brandingHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 400);
  } finally {
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgAssetsUploadTicketCreate returns asset metadata needed by the frontend", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __assetsTestHooks.setCreateUploadTicketOverride(async () => ({
    assetId: "ast_1",
    uploadUrl: "https://upload.example.com/ast_1",
    method: "PUT",
    headers: {
      "Content-Type": "image/png"
    },
    expiresAt: "2026-03-25T01:00:00Z",
    publicUrl: "https://cdn.example.com/assets/ast_1",
    asset: {
      id: "ast_1",
      purpose: "org_logo",
      status: "upload_pending",
      fileName: "logo.png",
      contentType: "image/png",
      sizeBytes: 2048,
      publicUrl: "https://cdn.example.com/assets/ast_1"
    }
  }));

  try {
    const event = {
      version: "2.0",
      routeKey: "POST /org/assets/upload-ticket",
      rawPath: "/org/assets/upload-ticket",
      rawQueryString: "",
      body: JSON.stringify({
        purpose: "org_logo",
        contentType: "image/png",
        fileName: "logo.png",
        sizeBytes: 2048
      }),
      headers: {
        "content-type": "application/json",
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/assets/upload-ticket", "POST", "req_asset_ticket_ok"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await uploadTicketHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 201);
    const body = JSON.parse(result.body as string) as {
      data: { asset: { id: string; purpose: string; status: string } };
    };
    assert.equal(body.data.asset.id, "ast_1");
    assert.equal(body.data.asset.purpose, "org_logo");
    assert.equal(body.data.asset.status, "upload_pending");
  } finally {
    __assetsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});

test("orgTenantBrandingUpdate returns logoUrl for immediate frontend refresh", async () => {
  const oldMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "mock";
  __tenantsTestHooks.setUpdateTenantBrandingOverride(async () => ({
    tenantId: "ten_1",
    logoAssetId: "ast_logo_1",
    logoUrl: "https://cdn.example.com/assets/ast_logo_1",
    updatedAt: "2026-03-25T01:00:00Z"
  }));

  try {
    const event = {
      version: "2.0",
      routeKey: "PATCH /org/branding",
      rawPath: "/org/branding",
      rawQueryString: "",
      body: JSON.stringify({
        logoAssetId: "ast_logo_1"
      }),
      headers: {
        "content-type": "application/json",
        "x-user-id": "usr_1",
        "x-tenant-id": "ten_1",
        "x-role": "org_admin"
      },
      requestContext: baseContext("/org/branding", "PATCH", "req_branding_ok"),
      isBase64Encoded: false
    } as APIGatewayProxyEventV2;

    const result = asStructuredResult(await brandingHandler(event, {} as never, () => undefined));
    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body as string) as {
      data: { logoAssetId: string | null; logoUrl: string | null };
    };
    assert.equal(body.data.logoAssetId, "ast_logo_1");
    assert.equal(body.data.logoUrl, "https://cdn.example.com/assets/ast_logo_1");
  } finally {
    __tenantsTestHooks.reset();
    process.env.AUTH_MODE = oldMode;
  }
});
