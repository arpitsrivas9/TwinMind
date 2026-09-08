# TwinMind

TwinMind is a secure personal AI operating system foundation built with a production-oriented full-stack architecture.

## Phase 1 includes
- Next.js frontend with landing, auth, dashboard, profile, and settings pages
- Express + TypeScript backend with JWT authentication and Prisma data access
- PostgreSQL schema for a user-first foundation
- REST API with validation, structured logging, and centralized error handling
- Environment-based configuration and Dockerized PostgreSQL support
- Basic security protections and isolated user data design

## Project structure

```text
TwinMind/
├── frontend/
├── backend/
├── docs/
├── docker-compose.yml
├── .gitignore
├── README.md
├── decisions.md
├── flow.md
└── .env.example
```

## Quick start

### 1. Start PostgreSQL
```bash
docker compose up -d postgres
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Default URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- PostgreSQL: localhost:5432

## Notes
Phase 1 is intentionally limited to the secure foundation and user account system. Future TwinMind modules can be added without major architectural rework.
