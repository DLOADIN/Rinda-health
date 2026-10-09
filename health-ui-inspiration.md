# Health UI inspiration for Rinda Health

Checked 9 October 2026. Star counts are from each GitHub page on that day. Rinda's stack is Vite, React Router and shadcn/ui on the Radix base, with lucide icons only. A project built on Next.js or Base UI is still useful for its layout, but its code needs adapting before we can use it.

## Top picks

| Rank | What | Why it suits Rinda | Link |
| --- | --- | --- | --- |
| 1 | **shadcn-admin** (satnaing), 15.6k stars, MIT | It is the closest match to our stack: Vite, shadcn on Radix, Tailwind v4, a built-in Sidebar, a Cmd+K search, dark mode and 10+ pages. Use it as the model for the staff console shell. | [GitHub](https://github.com/satnaing/shadcn-admin) · [Live demo](https://shadcn-admin.netlify.app/) |
| 2 | **Official shadcn sidebar blocks** (sidebar-01 to 16) | These are the source our design system already allows. `sidebar-07` (collapses to icons) suits the staff console, and `sidebar-08` (inset) suits a calmer participant layout on a tablet or desktop. Install with `npx shadcn add sidebar-07`. | [ui.shadcn.com/blocks/sidebar](https://ui.shadcn.com/blocks/sidebar) |
| 3 | **Official shadcn dashboard-01** | Stat cards, an area chart and a data table, built entirely from shadcn parts. It is a good starting point for the pilot insights page. | [ui.shadcn.com/blocks](https://ui.shadcn.com/blocks) |
| 4 | **Function Health** (product) | Biomarkers are grouped into body-system cards, each with a count (Heart and metabolic, Hormones, Mental health). It uses a three-step "how it works" strip and keeps a calm, editorial tone. Its logged-in results screens are not public, so study the marketing pages and App Store screenshots. | [functionhealth.com](https://www.functionhealth.com/) |
| 5 | **Superpower** (product) | Each biomarker is explained in plain language, the report is paired with an action plan, and it shows progress over time. This is the same idea as our results, planner and trends. | [superpower.com/the-grove](https://superpower.com/the-grove) |
| 6 | **Oura app redesign** (Instrument case study) | This is the best write-up of the "glance, focus, explore" pattern: rings and bars at the top, key vitals in the middle, and full trend charts underneath. It also uses one consistent colour meaning across the app. This matches how My Health Snapshot should work. | [instrument.com/work/oura-app](https://www.instrument.com/work/oura-app) |

## Open-source dashboards with a sidebar (shadcn)

| Project | Stack | Notes | Link |
| --- | --- | --- | --- |
| next-shadcn-dashboard-starter (Kiranism), 7.1k stars, MIT | Next.js 16, Base UI | Polished sidebar, header and content layout, URL-synced tables and Recharts overview. Copy the layout ideas, not the code (it uses a different router and primitives). | [GitHub](https://github.com/Kiranism/next-shadcn-dashboard-starter) |
| Studio Admin (arhamkhnz), 3.1k stars | Next.js 16 | Five dashboards (default, CRM, finance, analytics, productivity), a collapsible sidebar and switchable theme presets. Its preset system is a good model for light and dark Rinda themes. | [GitHub](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) · [Demo](https://studio-admin.arhamkhnz.com) |
| Square UI (ln-dev7), 6.1k stars | Next.js, Radix and Base UI variants | Twenty free, very clean templates. "Habit Tracker" and "Dashboard 3 to 5" are the most relevant. Skip the streak mechanics, because Rinda avoids streaks. | [GitHub](https://github.com/ln-dev7/square-ui) · [Demo](https://square.lndevui.com) |
| shadcn-admin-kit (marmelab), 1.1k stars, MIT | Vite, React Router, Base UI | Ready CRUD lists, tables, i18n and a sidebar. It is useful for the console's content-version and participant tables. | [GitHub](https://github.com/marmelab/shadcn-admin-kit) · [Demo](https://marmelab.com/shadcn-admin-kit/demo) |
| tweakcn, 10.3k stars | Web tool | A visual shadcn theme editor. Paste Rinda's colours in to preview every component before changing `rinda-theme.css`. | [tweakcn.com](https://tweakcn.com) · [GitHub](https://github.com/jnsahaj/tweakcn) |

## Health-specific projects and blocks

| Project | Notes | Link |
| --- | --- | --- |
| getbased, 125 stars | An open-source blood-work dashboard with reference ranges, trend flags, heatmaps and charts. Its "Labs / Body / Insight" structure is worth studying. **Licence is AGPL-3.0: look, don't copy code.** | [GitHub](https://github.com/elkimek/get-based) · [Live app](https://app.getbased.health) |
| biomarkers (mhaney93) | A small app on shadcn and Recharts. Its "Issues" list ranks out-of-range values worst first, and each biomarker page shows the range plus a trend. It is a good pattern for result cards. No licence is listed, so use it for ideas only. | [GitHub](https://github.com/mhaney93/biomarkers) · [Demo](https://biomarkers-kappa.vercel.app) |
| shadcn.io healthcare sidebar | A shadcn Sidebar with Patient Care, Clinical and Admin groups and badge counts. It is a useful reference for grouping the staff console menu. This site is not the official shadcn. | [shadcn.io/blocks/sidebar-healthcare](https://www.shadcn.io/blocks/sidebar-healthcare) |
| 21st.dev health stat card | A community shadcn-style health metric card. | [21st.dev](https://21st.dev/@ruixen.ui/components/health-stat-card) |

## Mental-wellness tone (for the PHQ-9 and GAD-7 part)

- **How We Feel** (Yale Center for Emotional Intelligence). Soft colour, one feeling per screen and no judgement. This is the calm tone Rinda's wellness section should have. [Screens on screensdesign](https://screensdesign.com/showcase/how-we-feel) · [Yale article](https://medicine.yale.edu/news-article/the-how-we-feel-app-helping-emotions-work-for-us-not-against-us/)

## Galleries to browse

- [Dribbble: healthcare dashboard UI](https://dribbble.com/services/search/healthcare-dashboard-ui) for visual ideas. Many shots are concepts that ignore contrast and real data.
- Mobbin (mobbin.com, account needed) has real app screens for Oura, Function and Headspace.

## What to take into Rinda

1. **Layout.** Use a participant bottom bar on phones, and an inset shadcn Sidebar (`sidebar-08`) from tablet width up. The staff console uses `sidebar-07`, following shadcn-admin.
2. **Snapshot.** Follow Oura's three levels: one summary line per area at the top, domain cards with band word, icon and value in the middle, and trends underneath.
3. **Results.** Group results into body-system cards with a count, as Function does, and add "Needs attention first" ordering, as the biomarkers app does.
4. **Explain everything.** Use Superpower's approach of a plain-language explanation for each result plus an action plan, which our "Why this result" and planner already cover.
5. **Avoid.** Streaks, red alarm styling for mental wellness, and decorative charts without text alternatives (these are already rules in DESIGN_SYSTEM.md).
