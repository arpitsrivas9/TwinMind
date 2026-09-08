# Execution Flow Documentation

This document explains the current execution flow for the project, the expected runtime order, and the parts of the codebase that were changed during this session.

## 1. Current project state

The workspace now contains a Phase 1 full-stack foundation. The frontend is a Next.js app and the backend is an Express API using Prisma for PostgreSQL access.

Relevant artifacts created in this session:
- [decisions.md](decisions.md) — records implementation reasoning and design decisions.
- [flow.md](flow.md) — execution and architecture documentation.
- `frontend/src/app/*` — landing, auth, dashboard, profile, and settings routes.
- `frontend/src/components/WorkspaceShell.tsx` — responsive authenticated workspace navigation.
- `frontend/src/components/TwinMindBackground.tsx` — route-aware canvas background and shell boundary.
- `frontend/src/components/ui.tsx` — shared UI primitives.
- `frontend/src/app/dashboard/page.tsx` — static cognitive workspace composition.
- `frontend/src/components/states.tsx` — shared empty/loading/processing/error/success/offline state panels.
- `frontend/src/components/AuthForm.tsx` — mode-aware login/signup form foundation.
- `frontend/src/components/ProfileForm.tsx` — profile identity form foundation.
- `frontend/src/components/SettingsPanel.tsx` — interactive local-preview settings foundation.
- `frontend/src/components/WorkspacePageHeader.tsx` — shared workspace route context and return navigation.
- `backend/src/*` — API bootstrap, middleware, routes, services, and Prisma client setup.
- `backend/prisma/schema.prisma` — Phase 1 `User` model.

## 2. Entry point of the project

Backend entry point: `backend/src/server.ts`.
Frontend entry point: Next.js App Router under `frontend/src/app`.

`server.ts` connects Prisma to PostgreSQL, then starts the Express listener. The frontend is started by Next.js and maps URL segments to files under `src/app`.

In a typical workflow, the startup sequence looks like this:
1. Load environment configuration
2. Initialize application services and dependencies
3. Register routes, handlers, or modules
4. Start the server or run the app loop
5. Handle incoming requests or events

## 3. Execution order (expected pattern)

The general execution path is:

1. `backend/src/server.ts` loads `backend/src/config/env.ts`, imports the Express app, connects Prisma, and listens on port 4000.

2. `backend/src/app.ts` creates Express middleware in this order: CORS, Helmet, JSON parsing, cookies, Morgan logging, API rate limiting, routes, not-found handling, and the error handler.

3. `backend/src/routes/authRoutes.ts` and `backend/src/routes/userRoutes.ts` register public auth and protected profile endpoints.

4. A request is validated with Zod, then the route calls `backend/src/services/authService.ts`, which hashes/checks passwords, creates JWTs, and reads/writes the Prisma `User` model.

5. The route returns the structured response. Failures pass to `backend/src/middleware/errorHandler.ts` for consistent error output and logging.

The dashboard composition is rendered as a static server page:

- `DashboardPage` renders workspace signals.
- `DashboardPage` composes `Card`, `Badge`, `Input`, and `Button` primitives.
- Conversation, active context, knowledge field, memory layer, and activity regions each expose their own empty or future state.
- No region calls the backend or owns application state yet; functionality is intentionally deferred to Phase 3/4.

State rendering flow:

- A route or future feature selects one of the semantic state components from `states.tsx`.
- The component maps the state kind to consistent icon and visual treatment.
- `loading` and `processing` expose `aria-busy`; non-error states use polite announcements.
- `error` and `offline` use alert semantics; an error state receives a future retry action.
- The state component renders its supplied action without deciding how the action works.

Form flow:

- `/login` and `/signup` render the shared `AuthForm` with the corresponding mode.
- `AuthForm` updates local field state and clears the field's previous error when edited.
- Submit runs local email/password/name validation and renders field-level feedback.
- Valid local input enters a short preparing preview state, then a ready-for-connection state.
- `/profile` renders `ProfileForm`, which follows the same local validation and preparing-preview sequence.
- No form currently calls the backend; API/session behavior remains a Phase 3 concern.

Settings flow:

- `/settings` renders the client-side `SettingsPanel`.
- Native radio controls and custom switch controls update `draftSettings`.
- A structural comparison against `savedSettings` determines whether the page has unsaved changes.
- Reset restores the last locally saved preview state.
- Save copies the draft into the locally saved preview and announces a success message.
- No preference is persisted beyond the current client session; backend integration remains deferred.

Route navigation flow:

- The workspace shell resolves the active pathname and highlights Workspace, Profile, or Settings.
- The TwinMind shell brand routes to `/dashboard`.
- Profile and Settings render `WorkspacePageHeader`, whose return link routes to `/dashboard`.
- Settings' Profile identity row routes to `/profile`.
- Landing page CTAs route to `/login` and `/signup` with Next.js client navigation.

Responsive layout flow:

- At mobile widths, the workspace shell uses the top bar and drawer navigation.
- Page-header actions wrap into available width instead of forcing horizontal overflow.
- Dashboard capture controls stack vertically until the `sm` breakpoint.
- Settings control rows stack content and controls until the `sm` breakpoint.
- Landing status rows stack label and value content until the `sm` breakpoint.
- Desktop and large workspace grids continue to use the existing `lg`/`xl` layout transitions.

For workspace page rendering:

1. `frontend/src/app/layout.tsx` renders `TwinMindBackground` around all routes.
2. `TwinMindBackground` selects canvas intensity from the current pathname.
3. For `/dashboard`, `/profile`, and `/settings`, it renders `WorkspaceShell` around the route content.
4. `WorkspaceShell` renders desktop sidebar navigation or the mobile navigation drawer.
5. The current route is resolved with `usePathname()` and marked with `aria-current="page"`.

## 4. Actual call chains

- Startup: `server.ts` → `env.ts` → `app.ts` → `prisma.$connect()` → `app.listen()`.
- Signup: `POST /api/auth/signup` → Zod schema → `registerUser()` → `prisma.user.findUnique()` → `bcrypt.hash()` → `prisma.user.create()` → `createToken()` → JSON response.
- Login: `POST /api/auth/login` → Zod schema → `loginUser()` → `prisma.user.findUnique()` → `bcrypt.compare()` → `createToken()` → JSON response.
- Profile read: `GET /api/users/me` → `requireAuth()` → `jwt.verify()` → `getUserById()` → Prisma select → JSON response.
- Profile update: `PATCH /api/users/me` → `requireAuth()` → Zod schema → `updateUserProfile()` → Prisma update → JSON response.

## 5. What function calls what

The current function-level flow is:

- `startServer()` → `prisma.$connect()` → `app.listen()`
- `authRoutes` handlers → `registerUser()` / `loginUser()`
- `userRoutes` handlers → `requireAuth()` → `getUserById()` / `updateUserProfile()`
- Service functions → Prisma client and bcrypt → route response
- Any thrown `AppError` or unexpected error → `errorHandler()`

This is the likely architectural flow once the project code is added.

## 6. AI changes made in this session

The AI work completed in this session included the Phase 1 application foundation and documentation updates.

Session changes:
- Created backend auth, profile, middleware, Prisma, configuration, and test files.
- Created frontend landing, auth, dashboard, profile, and settings routes.
- Added Docker/PostgreSQL setup, environment examples, package scripts, and API/database docs.
- Corrected the Prisma dependency pairing and generated Prisma Client.
- Added shared UI primitives in `frontend/src/components/ui.tsx`.
- Added responsive workspace navigation in `frontend/src/components/WorkspaceShell.tsx`.
- Integrated the shell only into workspace routes through `TwinMindBackground`.
- Replaced the generic dashboard with the static cognitive workspace foundation.
- Added shared UI state primitives and adopted `EmptyState` in the active-context dashboard panel.
- Replaced static auth/profile forms with reusable, accessible local-validation form foundations.
- Replaced static settings lists with accessible local-preview controls and saved/unsaved feedback.
- Added a shared workspace page header and completed internal route-link refinement.
- Applied targeted responsive refinements to landing, dashboard, auth, profile, and settings compositions.
- Normalized route surfaces to semantic TwinMind tokens and completed final navigation consistency cleanup.
- Added the first Phase 2 CSS motion layer to the dashboard cognitive core and knowledge field.
- Updated this file and `decisions.md` with the live architecture and validation status.
- Deliberately did not implement Phase 2+ AI, memory, RAG, voice, agent, trust, or device-control functionality.

## 7. How to maintain this file as the code grows

As the project develops, update this document whenever the architecture changes:

- Add the real entry point file and its exact startup sequence
- Record the actual function call order in the live application
- Document which modules are invoked during request flow
- Note which files were modified by AI or by other contributors
- Highlight any dependency injection or service initialization steps

## 8. Recommended future structure

When source files are added, this file should be updated to include:

- real entry point names and startup order
- module registration order
- controller-to-service-to-repository flow
- external API and database integration points
- AI-modified files in the current session
- sequence diagram or call tree for major workflows

## 9. Validation status

- Frontend production build: passed.
- Backend TypeScript build: passed.
- Prisma Client generation: passed.
- Backend auth tests: partially executed; invalid input passed, database-backed cases failed because PostgreSQL/Docker was unavailable at `localhost:5432`.

The database must be started and migrated before the auth tests or backend startup can be claimed as end-to-end verified.

## 10. Phase 1 visual readiness

- Design tokens and global visual foundation: implemented.
- Reusable UI primitives: implemented.
- Workspace shell and navigation: implemented.
- Static cognitive dashboard workspace: implemented.
- Shared UI state components: implemented.
- Auth/profile form states: implemented as local-only previews.
- Settings controls and local saved/unsaved states: implemented.
- Responsive safeguards: implemented.
- Final token/navigation cleanup: implemented.
- Browser screenshot review and product-owner visual approval: pending.
- Real frontend functionality, backend integration, AI systems, and advanced animation: intentionally deferred.

## 11. Phase 2 motion flow

- The dashboard conversation core receives `tm-core-breathe` and `tm-core-pulse` classes.
- The knowledge field receives `tm-orbit`, `tm-orbit-reverse`, and `tm-node-drift` classes.
- Keyframes are defined globally in `frontend/src/app/globals.css`.
- The reduced-motion media query removes all new animation declarations.
- The visual motion runs independently of backend state and does not imply that AI processing is active.
