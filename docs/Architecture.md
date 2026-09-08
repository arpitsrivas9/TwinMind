# Architecture

## Frontend
- Next.js app router
- TypeScript + Tailwind CSS
- Route-based pages for public and authenticated experiences
- Client-side auth state and route guards

## Backend
- Express.js REST API
- TypeScript
- Prisma + PostgreSQL
- JWT auth, validation, and middleware-based authorization

## Data flow
1. User signs up or logs in via frontend form
2. Frontend calls backend auth endpoints
3. Backend validates input and issues JWT
4. Protected routes confirm token against user identity
5. User data is read and updated through Prisma models

## Future compatibility
The architecture is intentionally modular so future modules like memory, agents, search, and voice can plug into the same service-oriented foundation.
