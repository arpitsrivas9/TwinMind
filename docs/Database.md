# Database

TwinMind uses PostgreSQL as the primary relational database for user and account data.

## Why PostgreSQL
- Excellent relational data integrity
- Strong support for modern application and analytics use cases
- Mature ecosystem and production reliability
- Clean fit for future user, memory, document, and agent models

## Prisma
Prisma is used as the ORM to provide type-safe database access, migrations, and a cleaner architecture for future growth.

## Current schema
The Phase 1 schema contains the `User` model only, since that is the required foundation for authentication and account isolation.
