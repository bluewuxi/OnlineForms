# OnlineForms

Backend scaffold for Phase 1 of OnlineForms MVP.

## Structure

- `infra/` deployment baseline (AWS SAM template)
- `services/` Lambda handlers and API code
- `shared/` shared utilities (correlation, guards, contracts)

## Implemented in P1-01

- Health endpoint: `GET /v1/health`
- Correlation ID handling:
  - Accepts incoming `x-correlation-id`
  - Falls back to API Gateway request ID
  - Returns `x-correlation-id` response header

## Local Dev

```bash
npm install
npm run typecheck
npm run build
```

## Deploy Baseline (SAM)

```bash
sam build -t infra/template.yaml
sam deploy --guided -t infra/template.yaml
```

