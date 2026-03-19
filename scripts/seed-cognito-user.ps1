param(
  [Parameter(Mandatory = $true)]
  [string]$UserPoolId,
  [string]$Username = "ricky",
  [string]$Email = "ricky.yu@outlook.com",
  [ValidateSet("org_admin", "org_editor", "platform_admin")]
  [string]$GroupName = "org_admin",
  [string]$DefaultTenantId = "ten_demo",
  [ValidateSet("org_admin", "org_editor", "platform_admin")]
  [string]$PlatformRole = "org_admin",
  [switch]$SuppressInvite
)

$delivery = if ($SuppressInvite) { "SUPPRESS" } else { "RESEND" }

Write-Host "Creating/updating Cognito user '$Username' in pool '$UserPoolId'..."

$createCmd = @(
  "cognito-idp", "admin-create-user",
  "--user-pool-id", $UserPoolId,
  "--username", $Username,
  "--user-attributes",
  "Name=email,Value=$Email",
  "Name=email_verified,Value=true",
  "Name=custom:defaultTenantId,Value=$DefaultTenantId",
  "Name=custom:platformRole,Value=$PlatformRole",
  "--message-action", $delivery
)

try {
  aws @createCmd | Out-Null
  Write-Host "User created."
} catch {
  Write-Host "User may already exist. Continuing with attribute update."
}

aws cognito-idp admin-update-user-attributes `
  --user-pool-id $UserPoolId `
  --username $Username `
  --user-attributes `
    Name=email,Value=$Email `
    Name=email_verified,Value=true `
    Name=custom:defaultTenantId,Value=$DefaultTenantId `
    Name=custom:platformRole,Value=$PlatformRole | Out-Null

aws cognito-idp admin-add-user-to-group `
  --user-pool-id $UserPoolId `
  --username $Username `
  --group-name $GroupName | Out-Null

Write-Host "Done."
Write-Host "User: $Username <$Email>"
Write-Host "Group: $GroupName"
Write-Host "defaultTenantId: $DefaultTenantId"
Write-Host "platformRole: $PlatformRole"
