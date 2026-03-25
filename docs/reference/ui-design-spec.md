# OnlineForms UI Design Spec

Last updated: 2026-03-25

## Purpose

This document defines the baseline UI direction for OnlineForms so future frontend work stays visually and structurally consistent across the public portal, organization portal, and internal portal.

This is a product UI spec, not a brand guideline. It should guide layout, component styling, hierarchy, and page composition.

Related mockups:

- `mockups/public-portal-mockup.svg`
- `mockups/org-portal-mockup.svg`
- `mockups/internal-portal-mockup.svg`

## Design Principles

1. Calm before clever.
   The product should feel trustworthy and clear before it feels expressive.
2. Layout over chrome.
   Use spacing, alignment, scale, and grouping before adding borders, cards, and decorative effects.
3. One strong idea per screen.
   Each page should have one obvious purpose and one dominant action.
4. Separate portal personalities.
   Public, organization, and internal portals should share a system but not feel identical.
5. Operational clarity wins.
   In authenticated portals, status, orientation, and next actions matter more than marketing language.

## Portal Styles

### Public Portal

Intent:
- welcoming
- editorial
- tenant-branded
- mobile-first

Visual character:
- large headline with a calmer, institutional tone
- prominent hero image or visual block
- generous whitespace
- light warm neutrals with one tenant accent color
- serif heading support is allowed here

Rules:
- The first screen should highlight tenant identity and the primary enrollment path.
- Use large, readable sections instead of dense card grids.
- Keep course browsing simple and confidence-building.
- Forms should feel short, linear, and easy to complete in one sitting.

### Organization Portal

Intent:
- focused
- practical
- structured
- less decorative than public pages

Visual character:
- restrained app shell
- course-first workspace
- list-detail layouts
- minimal accent color, mostly used for primary action and active step

Rules:
- The core flow is course details -> form builder -> preview -> publish.
- `Form builder` is part of the course workflow, not a separate primary destination.
- Avoid dashboard-card mosaics for routine work surfaces.
- Show status clearly: `draft`, `published`, `archived`.

### Internal Portal

Intent:
- dense
- precise
- administrative
- low ambiguity

Visual character:
- sharper app shell than the organization portal
- stronger contrast in navigation and detail panes
- list-first pages with a right-side drawer or inspector

Rules:
- Use top navigation only for major areas.
- Favor in-place detail drawers over full page jumps.
- Optimize for scanning, filtering, and editing records quickly.
- Show administrative status and validation states clearly.

## Navigation Model

### Public Portal

Expected primary flow:
1. Tenant home or catalog
2. Course detail
3. Enrollment form
4. Success state

Guidance:
- Keep navigation shallow.
- The primary CTA should always move the user toward enrollment.
- Use back links and breadcrumb-like orientation sparingly.
- Do not introduce complex menus in the public experience.

### Organization Portal

Primary navigation:
- Dashboard
- Courses
- Submissions
- Settings

Guidance:
- `Courses` is the main authoring workspace.
- Course editing should use tabs or a stepper inside the course workspace:
  - Details
  - Form
  - Preview
  - Publish
- `Submissions` should use a list-detail view with filtering by course and status.

### Internal Portal

Primary navigation:
- Home
- Tenants
- Users
- Logout

Guidance:
- `Tenants` and `Users` are list-first operational surfaces.
- Detail should open in a drawer or side panel where possible.
- Creation and edit flows should not break table/list context unless the task is unusually large.

## Layout Rules

### Global

- Use a consistent spacing system based on 8px increments.
- Prefer strong alignment and large margins over many containers.
- Default desktop content width should feel open, not cramped.
- Mobile layouts should collapse to a single readable column.

### Public Pages

- Hero sections may be wider and more expressive than app pages.
- Course lists should avoid over-fragmentation.
- Detail pages should pair key facts with a strong enrollment CTA.
- Forms should be single-column by default.

### Authenticated App Pages

- Use app-shell layouts with clear navigation, content area, and optional side context.
- Primary workspace should always dominate the screen.
- Avoid stacking many equal-weight cards.
- Tables, lists, inspectors, and steps are preferred over dashboard tiles.

## Typography

Base direction:
- Public portal may use a serif for major headings plus a practical sans-serif for UI.
- Organization and internal portals should rely primarily on a clean sans-serif.

Guidance:
- Headings should create hierarchy through size and spacing, not excessive weight alone.
- Use short headings that are scannable in one glance.
- Utility copy should be plain and operational.
- Avoid promotional language in authenticated product surfaces.

## Color System

Base palette:
- background neutrals: soft warm or cool off-whites
- text: dark slate, not pure black
- muted text: medium gray-green or gray-blue
- accent: one controlled brand/action color

Guidance:
- Public portal can use warmer tones.
- Organization portal should stay neutral with restrained accents.
- Internal portal may use deeper nav backgrounds for stronger separation.
- Avoid multiple competing accent colors.
- Status colors should be muted and readable, not loud.

Suggested semantic states:
- success/active: muted green
- warning/draft: ochre or amber
- danger/inactive: muted red
- info/current: deep blue-slate

## Surfaces And Components

### Cards

- Do not default to cards everywhere.
- Use cards only when the grouping needs a clear container.
- Public pages should prefer sections and rhythm over card-heavy layouts.
- App pages should prefer plain layouts, rows, tables, and panels.

### Buttons

- Primary buttons should be clearly filled and easy to identify.
- Secondary buttons should be quieter, usually outline or low-contrast filled.
- Destructive actions should be obvious but not visually dominant by default.

### Forms

- Forms should feel trustworthy and simple.
- Use clear labels above fields.
- Help text should be brief and directly useful.
- Validation should appear close to the field and use plain language.
- Long forms should be broken into logical sections.

### Tables And Lists

- Optimize for scanning with whitespace and strong column alignment.
- Use status chips sparingly and consistently.
- Keep row actions predictable.
- Filters should stay near the list they affect.

### Drawers And Inspectors

- Preferred for organization and internal detail views.
- Use them to preserve list context.
- Keep the main action pinned or visually consistent.

## Content Style

Public portal copy:
- concise
- welcoming
- plain-language

Organization and internal portal copy:
- utility-first
- direct
- action-oriented

Avoid:
- vague marketing claims
- decorative filler text
- long explanatory paragraphs inside operational pages

## Motion

Use motion only where it improves clarity.

Allowed patterns:
- soft page or section fade-in
- step or tab transition in course editing
- drawer slide-in for detail panels
- subtle hover state for interactive rows and actions

Avoid:
- ornamental floating effects
- exaggerated parallax
- constant motion in dashboards or tables

## Accessibility Baseline

- Maintain clear color contrast for text and controls.
- Ensure all status information is not color-only.
- Keep tap targets comfortable on mobile.
- Preserve keyboard access for navigation, dialogs, drawers, and forms.
- Use consistent heading structure on all pages.

## Page-Specific Guidance

### Public Catalog

- One dominant hero or tenant intro section.
- Course list should emphasize title, format, timing, and CTA.
- Keep filtering minimal unless real usage proves it necessary.

### Course Detail

- Show title, summary, dates, delivery mode, and requirements clearly.
- Keep `Enroll` visible without making the page feel aggressive.
- Preview of the form should be lightweight; the full form belongs in the next step.

### Enrollment Form

- Single-column layout.
- Clear progress and section boundaries if the form is long.
- Persistent reassurance about required fields and what happens after submission.

### Organization Course Workspace

- Start from the course list.
- Editing happens within a course-specific workspace.
- Preview should sit close to editing, not feel detached.

### Organization Submissions

- Use a filterable list with a detail panel.
- Make status changes easy and visible.
- Optimize for review cadence over visual novelty.

### Internal Tenants And Users

- Strong search and filters.
- Stable table/list layout.
- Drawer-based detail and edit behavior.
- Preserve list context during updates.

## Anti-Patterns

- Generic SaaS dashboard card grids as the default page structure
- Overly playful rounded UI for administrative surfaces
- Multiple accent colors on the same screen
- Public pages that look like admin software
- Authenticated pages that use homepage-style hero banners
- Splitting related authoring tasks across unrelated navigation items

## Implementation Notes

- If frontend work starts, build shared tokens for spacing, color, radius, and typography first.
- Create shared layout primitives for:
  - app shell
  - section header
  - list-detail view
  - right drawer
  - status chip
  - form section
- Keep public and authenticated themes related, but not identical.
- When uncertain, prefer the mockups and this spec over generic component-library defaults.
