# OnlineForms Live Environment Data

Static reference for AWS and DynamoDB environment state. Use this to look up tenant IDs,
user IDs, table ARNs, and Cognito details without querying AWS directly.

> **Keep this up to date** when tenants are added/removed, users are provisioned,
> or infrastructure changes. Last updated: 2026-04-09.

---

## AWS Environment

| Property        | Value                        |
|-----------------|------------------------------|
| Account ID      | `762563144177`               |
| Region          | `ap-southeast-2`             |
| IAM deploy user | `openclaw`                   |

---

## Cognito

| Property       | Value                          |
|----------------|--------------------------------|
| User Pool Name | `OnlineForms-users`            |
| User Pool ID   | `ap-southeast-2_zvWpA0Ulx`     |
| Token use      | `access`                       |

---

## DynamoDB Tables

### `OnlineFormsMain` — Business Data

| Property              | Value                                                                                     |
|-----------------------|-------------------------------------------------------------------------------------------|
| ARN                   | `arn:aws:dynamodb:ap-southeast-2:762563144177:table/OnlineFormsMain`                      |
| Billing               | PAY_PER_REQUEST                                                                           |
| Primary key           | `PK` (hash) + `SK` (range)                                                               |
| GSI2 (Public Catalog) | `GSI2PK` / `GSI2SK` — public course list by `tenantCode`                                 |

> **Note:** Schema doc references GSI1 (tenant feed) and GSI3 (submission by course),
> but these indexes are **not yet provisioned** on the live table. Items carry the
> `GSI1PK`/`GSI1SK`/`GSI3PK`/`GSI3SK` attributes for future index creation.

### `OnlineFormsAuth` — Auth & Membership

| Property                | Value                                                                                   |
|-------------------------|-----------------------------------------------------------------------------------------|
| ARN                     | `arn:aws:dynamodb:ap-southeast-2:762563144177:table/OnlineFormsAuth`                    |
| Billing                 | PAY_PER_REQUEST                                                                         |
| Primary key             | `PK` (hash) + `SK` (range)                                                             |
| GSI1 (Member Listing)   | `GSI1PK` / `GSI1SK` — list members of a tenant by role                                 |

---

## Tenants

### Tenant 1 — Studio School of Technology & Design

| Property      | Value                  |
|---------------|------------------------|
| `tenantId`    | `001`                  |
| `tenantCode`  | `std-school`           |
| `displayName` | Studio School of Technology & Design |
| `status`      | `active`               |
| DDB PK        | `TENANT#001`           |

**Courses:**

| `courseId`                      | Title                                        | Status      |
|---------------------------------|----------------------------------------------|-------------|
| `std_data_analytics_business`   | Data Analytics for Business Decisions        | `published` |
| `std_frontend_product_studio`   | Front-End Product Studio                     | `published` |
| `std_prompt_ops`                | Prompt Engineering for Operations Teams      | `published` |
| `std_ux_design_bootcamp`        | Applied UX Design Bootcamp                   | `published` |

---

### Tenant 2 — Southern Tourism & Hospitality Academy

| Property      | Value                                   |
|---------------|-----------------------------------------|
| `tenantId`    | `ten_59c62f610a5b`                      |
| `tenantCode`  | `stz-school`                            |
| `displayName` | Southern Tourism & Hospitality Academy  |
| `status`      | `active`                                |
| DDB PK        | `TENANT#ten_59c62f610a5b`               |

**Courses:**

| `courseId`                   | Title                                      | Status      |
|------------------------------|--------------------------------------------|-------------|
| `stz_barista_service`        | Certificate in Cafe & Barista Service      | `published` |
| `stz_event_operations`       | Event Operations Fundamentals              | `published` |
| `stz_hospitality_supervisor` | Hospitality Supervisor Essentials          | `published` |
| `stz_visitor_experience`     | Visitor Experience Coordinator Programme   | `published` |

---

## Users

### ricky.nz@yahoo.com

| Property       | Value                                          |
|----------------|------------------------------------------------|
| `userId`       | `591e1428-10c1-70cb-69f8-778a6b3b50af`         |
| Cognito status | `CONFIRMED`                                    |
| DDB PK         | `USER#591e1428-10c1-70cb-69f8-778a6b3b50af`    |

**Tenant memberships:**

| `tenantId`          | `role`      | `allowedRoles`                              | `status`  |
|---------------------|-------------|---------------------------------------------|-----------|
| `001`               | `org_admin` | `org_viewer`, `org_editor`, `org_admin`     | `active`  |
| `ten_59c62f610a5b`  | `org_admin` | `org_viewer`, `org_editor`, `org_admin`     | `active`  |

---

## Pending Invites

| `inviteId`                 | `tenantId` | `email`              | `role`       | `status`  | `expiresAt`              |
|----------------------------|------------|----------------------|--------------|-----------|--------------------------|
| `inv_8b1ea440d43c4d13`     | `ten_1`    | viewer@example.com   | `org_viewer` | `pending` | 2026-04-15T01:22:20.713Z |

> **Note:** `ten_1` does not match any provisioned tenant in `OnlineFormsMain`. This invite
> appears to be test/fixture data and will expire 2026-04-15.

---

## Quick-Reference AWS CLI Queries

```bash
# List all tenants
aws dynamodb scan --table-name OnlineFormsMain \
  --filter-expression "entityType = :t" \
  --expression-attribute-values '{":t":{"S":"TENANT"}}' \
  --projection-expression "tenantId, tenantCode, displayName, #s" \
  --expression-attribute-names '{"#s":"status"}' \
  --region ap-southeast-2

# Find Cognito user by email
aws cognito-idp list-users \
  --user-pool-id ap-southeast-2_zvWpA0Ulx \
  --filter "email = \"user@example.com\"" \
  --region ap-southeast-2

# List all memberships for a user
aws dynamodb query \
  --table-name OnlineFormsAuth \
  --key-condition-expression "PK = :pk AND begins_with(SK, :sk)" \
  --expression-attribute-values '{":pk":{"S":"USER#<userId>"},":sk":{"S":"MEMBERSHIP#"}}' \
  --region ap-southeast-2

# List all members of a tenant
aws dynamodb query \
  --table-name OnlineFormsAuth \
  --index-name GSI1 \
  --key-condition-expression "GSI1PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"TENANT#<tenantId>#MEMBERS"}}' \
  --region ap-southeast-2
```
