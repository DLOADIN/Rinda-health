# Design system

The Rinda look is **vibrant but calm**: warm Bone backgrounds, Ember for action, Rose, Blush and Amber for meaning, and plenty of space. Every screen is built from **shadcn/ui components only** (ADR-005, NFR-15) and themed by one file, [design/rinda-theme.css](design/rinda-theme.css).

> **Black-and-white update (23 October 2026, ADR-034).** The interface now uses only black, white and greys; the colour names below (Ember, Rose, Blush, Amber, Bone) remain as token names but every value is grey, set in `frontend/src/index.css` and [design/rinda-theme.css](design/rinda-theme.css). Light mode: white page, near-black text and primary buttons. Dark mode: the reverse. Result bands are told apart by fill weight, from an outlined light grey (meets recommendation) to solid black (seek care), and always keep their word and icon; mental-wellness results use a soft grey and are never black. The background glow is gone and the orb is a solid circle. There are no shadows (ADR-031). Since ADR-035 the typeface is Inter again, every corner is square except true circles (radio buttons, switches, slider handles, avatars), body text is 14px, and default buttons are 36px tall with a mouse and 44px on touch screens. `npm run check:contrast` checks every pair in the contrast table below against the new values; the hex values in that table and in the palette section are from the earlier colour theme.

## Principles

1. **Calm before clever.** Trauma-informed first: predictable layouts, gentle language, no alarm red for mood results, no countdowns, no surprise content.
2. **Meaning never relies on colour.** Every band shows a word and an icon as well as a colour (FR-10).
3. **Phone first.** Designed at 360 px, one question per screen, thumb-reachable actions, 44 px tap targets.
4. **Two languages, any length.** Kinyarwanda words are often longer; nothing has a fixed width that can clip text.
5. **Works offline and says so kindly.** Offline is a normal state, shown with a neutral Badge, never an error.

## shadcn/ui only

**What "shadcn only" means here**

- Every interface element is a shadcn/ui component added with `npx shadcn@latest add <name>`, or a composition of them in `src/components/`.
- Allowed underneath: whatever a shadcn component installs (Radix primitives, Recharts for Chart, Sonner, Vaul, cmdk, input-otp, embla, react-day-picker, TanStack Table, `class-variance-authority`, `cn`, `tw-animate-css`), plus `lucide-react` icons and Tailwind utility classes for layout and spacing.
- Not allowed: other component kits (MUI, Ant Design, Chakra, Mantine, Bootstrap, Headless UI, daisyUI, Flowbite, HeroUI, PrimeReact), other icon sets, other chart, toast, date-picker or animation libraries, CSS-in-JS. A repository hook blocks installing them.
- We own the generated source in `src/components/ui/`. Allowed edits: variants, sizes and token names. Anything else becomes a wrapper in `src/components/`.
- If shadcn has no component for a need, compose one from shadcn parts. Do not hand-roll a primitive that shadcn already has.

**Setup in `apps/web` (Milestone 0)**

```bash
npm create vite@latest apps/web -- --template react-ts
cd apps/web
npm i tailwindcss @tailwindcss/vite
npm i -D @types/node
# src/index.css: start with  @import "tailwindcss";
# tsconfig.json and tsconfig.app.json: "paths": { "@/*": ["./src/*"] }
#   (leave out "baseUrl"; TypeScript 6 reports it as deprecated)
# vite.config.ts: plugins [react(), tailwindcss()], alias "@" -> ./src
npx shadcn@latest init -b radix
npx shadcn@latest add button card badge alert progress radio-group field input input-group \
  button-group label separator drawer sheet dialog alert-dialog tabs accordion collapsible \
  slider switch select native-select toggle-group input-otp skeleton spinner empty item \
  sonner chart popover tooltip scroll-area
```

- **Primitive library: Radix** (`-b radix`). shadcn has defaulted to Base UI since July 2026 and supports both. Radix matches the SRS, keeps Sonner and fits the large body of shadcn examples. Do not mix the two.
- **Style:** pick Vega (the classic look) and Lucide icons when the CLI asks, or build a preset on ui.shadcn.com/create with Library set to Radix. The colours from the preset do not matter: replace the generated `:root`, `.dark` and `@theme inline` blocks with `docs/design/rinda-theme.css`.
- **Fonts:** self-host Inter with `@fontsource-variable/inter`; no font CDN (privacy and offline). Data-saver mode falls back to the system font.

**One-time component edits**

1. `button.tsx`: add sizes `touch: "h-11 px-5 text-base"` and `"icon-touch": "size-11"`, and make `touch` the default size (44 px). Staff screens may pass `size="sm"`.
2. `button.tsx`: the `destructive` variant uses `text-destructive-foreground` instead of `text-white`, because dark mode needs dark text on the lighter rose.
3. Checkbox, Radio Group and Switch rows: wrap each control and its label in a full-width row at least `min-h-11` so the whole row is the tap target.
4. Forms use **Field** with React Hook Form and Zod (the pattern on ui.shadcn.com/docs/forms), not the retired Form component.

## Palette

The five colours from the "Vibrant but Calm" reference:

| Name | Hex | Role |
| --- | --- | --- |
| Ember | `#E43D12` | Brand, focus ring, chart 1, illustrations, large headings |
| Rose | `#D6536D` | Chart 2, confirm band (deepened), destructive (deepened) |
| Blush | `#FFA2B6` | Secondary buttons, chart 4, calm support surfaces |
| Amber | `#EFB11D` | Attention band, chart 3, highlights |
| Bone | `#EBE9E1` | Page background |

**Why there are a few derived shades.** None of the four bright colours can carry normal-size text on its own at WCAG AA (4.5:1): white on Ember is 4.22:1, white on Rose 3.95:1, and Ember text on Bone 3.47:1. So the theme adds the smallest change that passes: Ember 600 `#D4380F` for primary buttons (white text 4.80:1), Ember 700 `#C2330E` for ember-coloured text and links, Rose 600 `#C24A63` and Rose 700 `#A83C53` for rose fills under white text, and a warm Ink `#2B1D16` for body text. Amber and Blush always carry Ink text (8.5:1 and 8.6:1). The five original colours stay exactly as given for surfaces, charts, the focus ring and brand moments.

**Rules**

- Use tokens only: `bg-primary`, `text-muted-foreground`, `bg-band-attention`, `text-brand-ember-strong`. Never raw hex values or arbitrary colour classes like `bg-[#E43D12]` in components.
- Ember is for action and brand. Do not use it for mental-wellness results.
- Large brand text (24 px and up) may use `text-brand-ember` (3:1 is enough for large text); smaller ember text uses `text-brand-ember-strong`.
- Light mode is the default (better outdoors). Dark mode follows the system setting or the Settings switch.

## Contrast table

Generated from `rinda-theme.css` by `node scripts/check-contrast.mjs`, which also runs in CI. Text needs 4.5:1; borders, focus rings and chart marks need 3:1.

| Use | Tokens | Light (fg / bg) | Light ratio | Dark (fg / bg) | Dark ratio | Needed | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Body text | `--foreground` on `--background` | #2B1D16 / #EBE9E1 | 13.39 | #EBE9E1 / #1B1411 | 14.96 | 4.5:1 | Pass |
| Text on cards | `--card-foreground` on `--card` | #2B1D16 / #F7F6F3 | 15.06 | #EBE9E1 / #241B17 | 13.89 | 4.5:1 | Pass |
| Primary button | `--primary-foreground` on `--primary` | #FFFFFF / #D4380F | 4.80 | #1B1411 / #EA5A33 | 5.20 | 4.5:1 | Pass |
| Secondary button | `--secondary-foreground` on `--secondary` | #2B1D16 / #FFA2B6 | 8.60 | #1B1411 / #FFA2B6 | 9.61 | 4.5:1 | Pass |
| Muted text on page | `--muted-foreground` on `--background` | #665C54 / #EBE9E1 | 5.36 | #B4A99F / #1B1411 | 7.89 | 4.5:1 | Pass |
| Muted text on cards | `--muted-foreground` on `--card` | #665C54 / #F7F6F3 | 6.03 | #B4A99F / #241B17 | 7.33 | 4.5:1 | Pass |
| Muted text on muted | `--muted-foreground` on `--muted` | #665C54 / #E0DDD3 | 4.79 | #B4A99F / #30251F | 6.47 | 4.5:1 | Pass |
| Hover / accent | `--accent-foreground` on `--accent` | #2B1D16 / #FBEECD | 14.12 | #EBE9E1 / #503B14 | 8.74 | 4.5:1 | Pass |
| Destructive button | `--destructive-foreground` on `--destructive` | #FFFFFF / #A83C53 | 6.11 | #1B1411 / #E0738A | 6.05 | 4.5:1 | Pass |
| Ember link on page | `--brand-ember-strong` on `--background` | #C2330E / #EBE9E1 | 4.58 | #EE6A45 / #1B1411 | 5.87 | 4.5:1 | Pass |
| Ember link on cards | `--brand-ember-strong` on `--card` | #C2330E / #F7F6F3 | 5.15 | #EE6A45 / #241B17 | 5.45 | 4.5:1 | Pass |
| Input border vs card (non-text) | `--input` on `--card` | #857F77 / #F7F6F3 | 3.67 | #7D7168 / #241B17 | 3.56 | 3:1 | Pass |
| Input border vs page (non-text) | `--input` on `--background` | #857F77 / #EBE9E1 | 3.26 | #7D7168 / #1B1411 | 3.84 | 3:1 | Pass |
| Focus ring vs page (non-text) | `--ring` on `--background` | #E43D12 / #EBE9E1 | 3.47 | #EE6A45 / #1B1411 | 5.87 | 3:1 | Pass |
| Focus ring vs card (non-text) | `--ring` on `--card` | #E43D12 / #F7F6F3 | 3.91 | #EE6A45 / #241B17 | 5.45 | 3:1 | Pass |
| Band: ok | `--band-ok-foreground` on `--band-ok` | #2B1D16 / #E2DDD0 | 12.01 | #EBE9E1 / #3A2F29 | 10.67 | 4.5:1 | Pass |
| Band: attention | `--band-attention-foreground` on `--band-attention` | #2B1D16 / #EFB11D | 8.51 | #1B1411 / #EFB11D | 9.51 | 4.5:1 | Pass |
| Band: confirm | `--band-confirm-foreground` on `--band-confirm` | #FFFFFF / #C24A63 | 4.72 | #1B1411 / #E58A9C | 7.31 | 4.5:1 | Pass |
| Band: urgent | `--band-urgent-foreground` on `--band-urgent` | #FFFFFF / #D4380F | 4.80 | #1B1411 / #EA5A33 | 5.20 | 4.5:1 | Pass |
| Band: wellness | `--band-wellness-foreground` on `--band-wellness` | #2B1D16 / #FFE3E9 | 13.50 | #EBE9E1 / #4A2C33 | 10.17 | 4.5:1 | Pass |
| Chart 1 vs card (graphics) | `--chart-1` on `--card` | #E43D12 / #F7F6F3 | 3.91 | #E43D12 / #241B17 | 4.00 | 3:1 | Pass |
| Chart 2 vs card (graphics) | `--chart-2` on `--card` | #D6536D / #F7F6F3 | 3.65 | #D6536D / #241B17 | 4.27 | 3:1 | Pass |
| Chart 5 vs card (graphics) | `--chart-5` on `--card` | #6E5E53 / #F7F6F3 | 5.73 | #B4A99F / #241B17 | 7.33 | 3:1 | Pass |
| Amber stroke vs card (graphics) | `--brand-amber-strong` on `--card` | #A87C14 / #F7F6F3 | 3.50 | #EFB11D / #241B17 | 8.82 | 3:1 | Pass |
| Blush stroke vs card (graphics) | `--brand-blush-strong` on `--card` | #B26F7E / #F7F6F3 | 3.55 | #FFA2B6 / #241B17 | 8.92 | 3:1 | Pass |
| Sidebar active item | `--sidebar-primary-foreground` on `--sidebar-primary` | #FFFFFF / #D4380F | 4.80 | #1B1411 / #EA5A33 | 5.20 | 4.5:1 | Pass |

## Result bands

| Severity | Token | Icon (lucide) | Example label | Used for |
| --- | --- | --- | --- | --- |
| `ok` | `band-ok` | `CircleCheck` | Meets recommendation | Within recommended ranges |
| `attention` | `band-attention` | `CircleAlert` | Below recommended | Habits worth changing, high-normal BP |
| `confirm` | `band-confirm` | `Stethoscope` | Check at a health centre | BP in the hypertension range, waist substantially increased, BMI 30 or more |
| `urgent` | `band-urgent` | `Hospital` | Seek care today | BP 180/110 or more only |
| `wellness` | `band-wellness` | `HeartHandshake` | Support is available | PHQ-9 and GAD-7 above minimal |
| `unknown` | dashed `border-input` | `CircleHelp` | Not enough information | Missing inputs |

Labels come from approved content; the words above are placeholders. The mapping from domain bands to severities is in [SCORING_RULES.md](SCORING_RULES.md) Section 3. Build one `BandBadge` component (Badge plus icon plus label) and use it everywhere.

## Typography and layout

- Inter Variable, base 16 px, line height 1.5. Question text `text-xl`, screen titles `text-2xl font-semibold`, metadata `text-sm` at the smallest. Never below 14 px.
- Set `lang="en"` or `lang="rw"` on `<html>` so screen readers and hyphenation behave; allow wrapping with `break-words`.
- Participant screens: single column, `max-w-screen-sm mx-auto px-4`. Sticky bottom bar for "Get help now" with `pb-[env(safe-area-inset-bottom)]` for installed apps.
- Staff console: shadcn Sidebar layout, full width, dense tables allowed.
- Radius `0.75rem`; cards `rounded-xl`; spacing on a 4 px grid (`gap-4`, `p-4`, `p-6`).

## Components by need

| Need | shadcn components | Notes |
| --- | --- | --- |
| App shell | Button, ToggleGroup, Badge, Drawer | Header: language switch, Exit; sticky Get help now; offline Badge |
| One question per screen | Field, RadioGroup, Label, Button, Progress | Options as full-width rows; no preselected answer; "Skip this question" as a secondary Button |
| Numbers with units | Field, InputGroup (unit addon), ButtonGroup with Input for steppers | `inputMode="decimal"`; units always visible |
| Long pick lists (district) | NativeSelect on phones, Select on desktop | |
| PIN and lock screen | InputOTP | Numeric, masked |
| Results dashboard | Card, Badge (BandBadge), Chart, Tabs, Collapsible, Alert | See [FEATURES.md](FEATURES.md) Feature 2 |
| Explanations | Accordion | "What we used", "The rule", "What would change it" |
| What-if | Slider, ButtonGroup, Select, Switch, Badge | Labelled "Simulation. Nothing is saved." |
| Guide | Drawer (phone) or Sheet (desktop), Button chips, Card, Collapsible, Skeleton | No text input |
| Care directory | Item, NativeSelect or Select, Button (tel: links), Badge | |
| Clinic card | Dialog (full screen on phones), Card | QR code rendered as SVG inside the Card |
| Confirmations | AlertDialog | Wipe, delete data, publish; never for quick exit |
| Feedback | Sonner | Sync and update messages; never for safety messages |
| Loading and empty | Skeleton, Spinner, Empty | |
| Staff console | Sidebar, Table with TanStack Table (Data Table), Breadcrumb, Pagination, Command, Kbd, DropdownMenu, Chart, Dialog | Staff-only screens may use smaller sizes |

## Charts

- Use the shadcn `ChartContainer` with a config that points at `var(--chart-1)` to `var(--chart-5)` or band tokens. shadcn Chart currently wraps Recharts v3.
- Amber and Blush fills need a stroke in `--brand-amber-strong` or `--brand-blush-strong` to reach 3:1 against cards.
- Always print the value as text next to the chart, and give the chart `aria-hidden="true"` with an adjacent sentence or table carrying the same data.
- No pie or donut charts for a single value; use a radial progress or a band bar.
- Band zones behind a value are decorative tints and are always labelled.
- Charts load on demand (NFR-17).

## Motion

Only the small transitions shadcn components already use. Respect `prefers-reduced-motion` (handled in the theme file). No auto-advancing screens, no confetti, no shaking errors.

## Do and don't

| Do | Don't |
| --- | --- |
| "Below recommended" with an icon and Amber | A red badge that says "Bad" |
| A calm Bone safety screen with large call buttons | A flashing emergency banner |
| "You can skip any question" under sensitive questions | Disabled Next buttons that force an answer |
| Neutral offline Badge: "Offline: answers saved on this phone" | An error toast every time the network drops |
| Show the number, the band word and the target together | A coloured dot alone |
| Behaviour goals for body-size results | Weight-loss targets or body-shape images |
