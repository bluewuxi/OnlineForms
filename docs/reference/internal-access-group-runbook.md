# Internal Access Group Runbook (P9-05)

## Canonical Mapping

- Internal portal capability is driven by Cognito group membership.
- Canonical group name is configured by CloudFormation parameter:
  - `CognitoInternalGroupName` (default: `internal_admin`)
- Runtime environment variable used by API:
  - `COGNITO_INTERNAL_GROUP_NAME`

## CloudFormation Support

- Managed stack creates the internal group resource:
  - `OnlineFormsInternalAdminGroup` (`AWS::Cognito::UserPoolGroup`)
- Stack output includes resolved internal group name:
  - `CognitoInternalGroupName`

## Migration Guidance (Existing Users)

1. Resolve user pool id and internal group name from stack outputs.
2. Add intended internal users into the internal group.

Example commands:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <user-pool-id> \
  --username <user-sub-or-username> \
  --group-name <internal-group-name>
```

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <user-pool-id> \
  --username <user-sub-or-username>
```

## Troubleshooting (Mixed Internal + Tenant Users)

1. User can access tenant portal but not internal portal:
   - Confirm user is in `CognitoInternalGroupName`.
   - Confirm token claim includes `cognito:groups` with internal group.
2. Internal directory `/v1/internal/access-users` empty unexpectedly:
   - Confirm `COGNITO_INTERNAL_GROUP_NAME` matches actual user-pool group name.
   - Verify users are enabled and confirmed in the group.
3. Internal route denied with valid tenant membership:
   - Tenant membership does not grant internal portal access.
   - Internal portal requires internal group/claim capability.
