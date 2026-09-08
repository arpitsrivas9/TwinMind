# Decisions Log

This document records the considerations and reasoning behind the implementation choices made while changing the code in this project. It is intended to be a living record so future work can understand not only what was built, but why it was built that way.

## 1. Project starting point

Decision: Keep a single decisions log in the root of the project and update it as changes are made.

Why this approach:
- The workspace is currently empty, so the most useful first step is to establish a clear place for design reasoning.
- A decisions log reduces the risk of future "why was this done this way?" questions.
- It provides traceability for technical and product choices without forcing the team to reverse-engineer the code from scratch.

## 2. Prefer simplicity over premature abstraction

Decision: Implement the smallest clear structure first instead of introducing complex patterns or frameworks too early.

Why this approach:
- Simpler code is easier to understand, test, and change.
- Early abstraction can create unnecessary complexity before the real requirements are clear.
- This keeps the project flexible while the actual feature work is still being discovered.

Considerations:
- Avoid adding architectural layers that are not yet needed.
- Prefer direct implementation when the task is small and the domain is still evolving.
- Revisit abstraction only when repeated patterns become clear and justified.

## 3. Minimize dependencies unless a library is clearly required

Decision: Use only the libraries necessary to solve a real problem.

Why this approach:
- Fewer dependencies reduce install time, upgrade risk, and maintenance burden.
- Smaller dependency sets make debugging and onboarding easier.
- A lightweight stack is easier to reason about in a small or early-stage project.

Why a library may be added:
- It solves a real requirement that would take longer or be less reliable to implement manually.
- It is well-supported and actively maintained.
- It reduces technical risk compared to building custom logic from scratch.

What to record when a library is chosen:
- What problem it solves
- Why alternatives were not preferred
- The maintenance and compatibility trade-offs
- The cost of adding the dependency versus writing the logic ourselves

## 4. Prefer explicit, readable code over clever shortcuts

Decision: Favor clarity and maintainability over concise but hard-to-follow patterns.

Why this approach:
- Clear code is easier to review and safer to modify.
- It reduces the chance of hidden bugs and makes onboarding faster.
- In most projects, readability creates more long-term value than micro-optimization.

Considerations:
- Use readable naming instead of cryptic variables.
- Keep functions focused on one responsibility.
- Avoid overengineering solutions for edge cases that are not required yet.

## 5. Validate changes against the real behavior needed

Decision: Check whether the implementation solves the actual user or system requirement, not just whether the code compiles.

Why this approach:
- A technically valid change can still be wrong if it misses the real requirement.
- Validation keeps the project aligned with the intended behavior.
- It reduces the chance of shipping features that are "working" but not useful.

Considerations:
- Confirm input/output expectations.
- Test the critical flow before polishing the implementation.
- Keep feedback loops short so adjustments are easy to make.

## 6. Keep design notes attached to the code change

Decision: When a project change introduces a significant decision, record it here with context and rationale.

Why this approach:
- The code alone often does not explain the reasoning behind a design choice.
- A written record helps reviewers understand trade-offs without extensive discussion.
- It supports future refactors by preserving the intent behind the original implementation.

Template for future entries:
- Decision
- Context or problem being solved
- Options considered
- Why this option was selected
- Risks, trade-offs, and follow-up notes

## 7. Example of a future decision entry

Decision: Use a specific library for state management / API handling / UI logic.

Why this approach:
- The library reduces repetitive boilerplate.
- It makes data flow easier to reason about.
- It matches the project requirements better than a custom implementation.

Alternatives considered:
- Custom implementation
- Another library with a heavier abstraction
- A lower-level native approach

Why this library was chosen:
- Better fit with the project architecture
- Stronger ecosystem support
- Simpler integration with the existing stack
- Lower maintenance cost for the current stage of the project

## 8. Full-stack Phase 1 foundation

Decision: Use Next.js and React for the frontend, with an Express and TypeScript API backed by PostgreSQL and Prisma.

Why this approach:
- Next.js provides route-based pages and a production-ready frontend foundation.
- Express keeps API behavior explicit and easy to test.
- TypeScript improves safety across the frontend and backend.
- PostgreSQL provides durable relational storage for account data.
- Prisma provides typed queries and migrations without hand-written SQL for the initial model.

Scope boundary:
- Phase 1 contains authentication, profile foundations, settings scaffolding, and secure application plumbing.
- Memory, RAG, agents, voice, TwinTrust™, cross-device control, and other Phase 2+ systems are deliberately excluded.

## 9. Security baseline

Decision: Add Helmet, CORS configuration, JSON size limits, rate limiting, bcrypt password hashing, JWT authentication, Zod request validation, and centralized errors.

Why this approach:
- These controls address common web/API risks without introducing an unnecessary security framework.
- Passwords are never stored directly; only bcrypt hashes are persisted.
- JWT middleware keeps protected user routes isolated from public auth routes.
- Centralized errors keep response structure consistent and avoid leaking internal details.

## 10. Prisma version correction

Decision: Use the stable Prisma 6 client and CLI pairing instead of the initially installed Prisma 7/8 preview combination.

Why this approach:
- The preview combination did not expose the expected `PrismaClient` API and did not support the normal `prisma generate` command in this environment.
- Prisma 6 generated the client successfully from the existing schema and restored compatibility with the service layer.

Trade-off:
- This favors predictable tooling over preview-version experimentation. The dependency can be upgraded deliberately later with a migration plan.

## 11. Validation record

Verified:
- Prisma Client generated successfully with Prisma 6.19.3.
- Backend TypeScript build passed.
- Frontend production build passed and generated the Phase 1 routes.
- Invalid signup validation test passed.

Blocked validation:
- Database-backed auth tests cannot pass until PostgreSQL is running on `localhost:5432`.
- Docker could not connect because the Docker Desktop Linux engine was not running in this environment.

## 12. Reusable UI primitive foundation

Decision: Add a small shared UI primitive module at `frontend/src/components/ui.tsx` before redesigning individual routes.

Why this approach:
- Buttons, cards, badges, inputs, and fields are repeated visual language across the product.
- Centralizing these patterns prevents route-by-route styling drift.
- A single module is appropriate at this stage because the primitive set is small; it avoids adding a component library dependency before the product language is validated.
- The primitives consume the global TwinMind tokens instead of hardcoding a second color system.

Scope boundary:
- P0.2 establishes reusable building blocks only.
- Existing routes were intentionally not migrated yet so their visual changes can be reviewed separately from the foundation work.

Trade-offs:
- The module currently uses a lightweight local `cn` helper rather than adding `clsx` or another dependency.
- More specialized primitives should be added only when a real repeated interaction pattern appears.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the new primitive module or global stylesheet.

## 13. Responsive workspace shell

Decision: Add `WorkspaceShell` as a shared client component and activate it only for `/dashboard`, `/profile`, and `/settings`.

Why this approach:
- These routes represent the authenticated product workspace and need consistent navigation.
- Keeping the shell at the shared background boundary avoids duplicating layouts across three route files.
- Public landing and authentication pages remain visually focused and do not inherit authenticated navigation.
- A responsive drawer provides mobile navigation without adding a new dependency.

Navigation behavior:
- Workspace, Profile, and Settings are active links.
- Memory, Search, and Tasks are visible as intentionally unavailable future destinations rather than dead links.
- Active routes expose `aria-current`; the mobile menu exposes expanded/controlled state.

Trade-off:
- The shell is integrated before route content is migrated to the new primitives. That migration belongs to the next workspace-design task so the shell and dashboard redesign can be reviewed independently.

## 14. Static cognitive workspace foundation

Decision: Replace the generic dashboard placeholder with a static cognitive workspace before adding real functionality or advanced motion.

Workspace regions:
- Conversation and thought-capture entry point
- Active context
- Knowledge field visualization
- Memory layer
- System activity
- Workspace signals for memories, context, and tasks

Why this approach:
- These regions map directly to TwinMind's conceptual hierarchy without inventing unrelated product features.
- Empty and future-state language makes the Phase 1 boundary explicit while still giving later functionality a clear home.
- The composition is intentionally static so Phase 2 animation can enhance the structure instead of hiding missing structure.

Scope boundary:
- The conversation input, search field, memory layer, and knowledge field are visual foundations only.
- No API calls, AI responses, persistence, search behavior, or backend integration were added.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Dashboard diagnostics were cleared after normalizing Tailwind v4 size utilities.

## 15. Shared UI state system

Decision: Add reusable state panels in `frontend/src/components/states.tsx` for empty, loading, processing, error, success, and offline conditions.

Why this approach:
- TwinMind will depend on asynchronous AI, search, memory, and context operations, so state design must exist before functionality is connected.
- A common `StatePanel` keeps hierarchy, icon treatment, spacing, and messaging consistent across the product.
- State panels expose `role`, `aria-live`, and `aria-busy` semantics instead of relying only on visual color.

Scope boundary:
- The state components are visual and accessible foundations only.
- They do not own fetching, retries, persistence, or application state.
- `ErrorState` provides a visual retry affordance, but actual retry behavior belongs to later frontend functionality work.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the state system or dashboard consumer.

## 16. Auth and profile form foundation

Decision: Consolidate login and signup into `AuthForm`, and create a separate reusable `ProfileForm` using the shared `Field`, `Input`, `Button`, `Card`, and `Badge` primitives.

Why this approach:
- Login and signup share the same interaction language but have different field requirements, so one mode-aware component avoids duplicated markup without forcing the pages into one product flow.
- Profile has a distinct identity-editing purpose, so it receives its own focused component while reusing the same primitives.
- Empty fields replace hardcoded demo credentials and make the UI safe to present or test.

State coverage:
- Idle fields with placeholders
- Focus-visible controls
- Inline field validation errors
- Form-level error summary
- Local preparing/submitting preview
- Ready-for-connection success state
- Disabled submit control while preparing

Scope boundary:
- These forms perform local validation only.
- They do not authenticate, create users, persist profile changes, or call the backend.
- The ready message explicitly states that real connection behavior belongs to Phase 3.

Accessibility:
- Labels use `htmlFor` and inputs have stable IDs and names.
- Autocomplete hints are provided for name, email, username, current password, and new password.
- Invalid fields expose `aria-invalid` and reference their error text with `aria-describedby`.
- Feedback uses polite status or alert semantics.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the form components or pages.

## 17. Settings interaction foundation

Decision: Replace the static settings lists with a client-side `SettingsPanel` that models draft preferences separately from saved preview preferences.

Why this approach:
- Settings needs visible interaction patterns before real persistence exists.
- Separating `draftSettings` from `savedSettings` makes unsaved changes, reset, and save feedback explicit and easy to replace with API persistence later.
- The control set stays aligned with TwinMind: appearance, proactive suggestions, weekly reflection, private workspace, and future data controls.

Controls:
- Appearance uses native radio inputs.
- Boolean preferences use accessible `role="switch"` buttons with `aria-checked`.
- Account and future data controls use status badges rather than pretending to be available.
- Save and Reset are disabled until a draft differs from the saved preview.

Scope boundary:
- Save only updates in-memory client state for the current page session.
- No localStorage, API call, backend persistence, or real appearance theme switching was added.
- The UI labels this clearly as a local preview and states that persistence belongs to Phase 3.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the settings panel or route.

## 18. Navigation and route refinement

Decision: Add `WorkspacePageHeader` for consistent workspace route context and use Next.js internal links throughout the frontend navigation.

Why this approach:
- Profile and Settings previously had no visible way back to the main workspace once the sidebar was not the user's focus.
- A shared header keeps route title, eyebrow, description, status, and return affordance consistent.
- `next/link` preserves the App Router navigation model for internal links instead of forcing full document reloads.

Navigation behavior:
- Profile and Settings expose a visible “Back to workspace” link.
- The TwinMind brand in the workspace shell links to `/dashboard`.
- The Settings Profile identity row links to `/profile`.
- Landing CTAs use `next/link` for `/login` and `/signup`.
- Existing active-route highlighting and mobile drawer behavior remain unchanged.

Scope boundary:
- No route guards, logout, session behavior, or authentication logic were added.
- Future navigation destinations remain visibly unavailable rather than becoming dead links.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the refined navigation components.

## 19. Responsive refinement pass

Decision: Make targeted responsive adjustments at existing Tailwind breakpoints instead of introducing a new layout system.

Changes:
- Workspace page-header actions wrap and become full-width on narrow screens.
- Dashboard Profile/Settings actions wrap.
- Dashboard thought capture stacks vertically on small screens and returns to a row at `sm`.
- Settings rows stack their label and control below `sm`, preventing cramped controls.
- Auth header content wraps naturally when the Phase badge competes with the title.
- Landing-page status rows stack their label/value pairs below `sm`.

Why this approach:
- These changes address concrete narrow-width pressure points while preserving the established desktop composition.
- Existing breakpoints remain predictable and avoid overfitting to one device width.
- No visual behavior was invented for future functionality; only layout resilience was improved.

Validation:
- TypeScript/editor diagnostics passed for all edited files.
- Frontend lint passed.
- Frontend production build passed.
- Browser-level viewport screenshots were not available in this environment; manual review at 320px, 390px, 768px, 1024px, and 1440px remains required.

## 20. Final Phase 1 visual QA cleanup

Decision: Normalize route-level visual classes onto the semantic TwinMind token system and remove remaining navigation inconsistencies without changing product scope.

Cleanup completed:
- Landing, dashboard, login, signup, profile, and settings route surfaces now use semantic background/text tokens.
- Landing CTA and status rows use the shared visual language more closely.
- Shared button/badge utility syntax was normalized for Tailwind v4.
- Workspace mobile backdrop uses the semantic background token.
- Desktop and mobile TwinMind brand marks both link directly to `/dashboard`.
- No raw anchor navigation, demo `defaultValue` credentials, or focus-suppression classes remain in the frontend routes.

Intentional exceptions:
- `text-slate-950` remains on cyan buttons for deliberate contrast.
- “Planned”, “Soon”, and future-phase language remains because those areas are intentionally not implemented in Phase 1.
- The existing canvas cognitive background remains as a restrained foundation effect; advanced cinematic motion is still a Phase 2 concern.

Readiness:
- The static UI foundation, workspace shell, dashboard structure, state system, forms, settings controls, navigation, and responsive safeguards are implemented.
- Browser-level visual QA at target viewport widths is still required before declaring the design visually approved.

## 21. Phase 2 motion milestone

Decision: Add restrained CSS-only motion to the existing dashboard core and knowledge-field anchors before attempting larger cinematic or WebGL systems.

Motion added:
- Slow breathing scale/opacity on the conversation core.
- Gentle inner-core pulse.
- Slow clockwise and counterclockwise knowledge-field orbit rings.
- Subtle drift on knowledge nodes.

Why this approach:
- It makes the existing cognitive metaphor feel alive without changing the dashboard structure.
- CSS keeps the first motion milestone lightweight and maintainable.
- It avoids adding a new animation library or expanding the existing canvas system prematurely.
- The motion is intentionally calm so TwinMind remains intelligent and focused rather than visually noisy.

Accessibility and performance:
- `prefers-reduced-motion: reduce` disables all new foreground animations.
- The existing canvas background already pauses animation for reduced-motion users and hidden documents.
- No new event listeners, WebGL contexts, or runtime state were added.

Scope boundary:
- This is not the full Phase 2 cinematic system.
- Scroll choreography, magnetic interactions, particle-flow expansion, and WebGL/canvas product visuals remain future Phase 2 work.

Validation:
- Frontend lint passed.
- Frontend production build passed.
- Editor diagnostics reported no errors in the motion stylesheet or dashboard.
