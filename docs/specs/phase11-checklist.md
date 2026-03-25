# OnlineForms Phase 11 Checklist

Source: UI implementation plan derived from `docs/reference/ui-design-spec.md`

## Workflow Rule

Implement tasks strictly in order. For each task:
1. Implement feature
2. Write brief change summary in linked GitHub issue
3. Update checklist status
4. Move to next task

Phase 11 is intended for frontend UI implementation across public, organization, and internal portals.

## Tasks

- [ ] P11-01 Frontend foundation and design-system baseline
  Issue: https://github.com/bluewuxi/OnlineForms/issues/58
  Scope:
  - Establish frontend app shell, routing, and shared layout primitives
  - Implement design tokens for spacing, typography, color, radius, and status styles
  - Translate `docs/reference/ui-design-spec.md` into reusable UI components

- [ ] P11-02 Public portal catalog and tenant-home experience
  Issue: https://github.com/bluewuxi/OnlineForms/issues/59
  Scope:
  - Build tenant home / catalog entry flow for public visitors
  - Implement course listing and course-detail pages using the public portal style direction
  - Keep the public navigation shallow and mobile-first

- [ ] P11-03 Public enrollment form and success flow
  Issue: https://github.com/bluewuxi/OnlineForms/issues/60
  Scope:
  - Build the enrollment form as a single-column guided flow
  - Add validation, progress cues, submit states, and success confirmation
  - Keep the experience consistent with the documented low-friction public UX

- [ ] P11-04 Organization portal IA refresh and course workspace
  Issue: https://github.com/bluewuxi/OnlineForms/issues/61
  Scope:
  - Implement organization portal navigation (`Dashboard`, `Courses`, `Submissions`, `Settings`)
  - Build the course-first workspace with step-based editing (`Details`, `Form`, `Preview`, `Publish`)
  - Keep form building inside the course workflow rather than as a separate destination

- [ ] P11-05 Organization submissions and settings surfaces
  Issue: https://github.com/bluewuxi/OnlineForms/issues/62
  Scope:
  - Build submission list/detail review surfaces with filtering and status updates
  - Add tenant settings pages for branding/profile management
  - Keep the portal visually restrained and optimized for repeated operational use

- [ ] P11-06 Internal portal UI implementation
  Issue: https://github.com/bluewuxi/OnlineForms/issues/63
  Scope:
  - Implement internal top navigation (`Home`, `Tenants`, `Users`, `Logout`)
  - Build list-first management screens with right-side drawer detail/edit patterns
  - Align tenant and user workflows with the internal portal UX documented in Phase 10

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
