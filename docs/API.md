# API

## Auth endpoints
- POST /api/auth/signup
- POST /api/auth/login

## User endpoints
- GET /api/users/me
- PATCH /api/users/me

## Health check
- GET /api/health

## Response format
The API returns structured JSON responses using a consistent `{ success, data }` or `{ success, error }` format.
