# Design Patterns Reference — BuilderAI

Use these patterns based on app type to create visually stunning, production-quality layouts.

## Portfolio / Personal Website
- Full-bleed hero with gradient bg (from-violet-950 via-zinc-900 to-zinc-950)
- Animated typing effect on headline using CSS @keyframes, NOT framer-motion
- Stats row: "5+ Years · 20+ Projects · 10k+ Stars" in glass cards
- Bento grid for projects (mix of 1x1 and 2x1 cards)
- Floating action: sticky "Contact Me" or chat button bottom-right
- Section transitions: subtle border-t border-zinc-800 between sections
- Skills shown as grouped pill badges, not plain lists
- Project cards: gradient header image area + tech stack badges at bottom
- Use gradient text for name/accent: `bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent`

## E-commerce / Store
- Sticky category navbar with horizontal scroll on mobile
- Product grid: 2 cols mobile, 3 cols tablet, 4 cols desktop
- Quick-add button overlay on hover (absolute positioned)
- Cart drawer (slide-in from right using Dialog/Sheet)
- Price display: text-2xl font-bold with line-through for original price
- Star rating as filled/unfilled star icons (lucide-react Star)
- Category filter as horizontal pill buttons (active = filled, inactive = outline)
- Product card: image top, title + price + rating bottom, hover shadow-xl

## Dashboard / Admin Panel
- Sidebar navigation (w-64, collapsible on mobile)
- Top row: 4 stat cards with icon, value, label, and trend arrow (up/down %)
- Main chart section: recharts AreaChart or BarChart with gradient fill
- Data table with: sortable headers, search input, pagination
- Activity feed: timeline-style list with avatars and timestamps
- Status badges: green=active, yellow=pending, red=error
- Quick actions: floating "+" button or command palette (Cmd+K)

## SaaS Landing Page
- Hero: large headline + subtitle + 2 CTA buttons + product screenshot/mockup
- Social proof row: "Trusted by 500+ companies" with logo grid
- Feature grid: 3 columns, each with lucide icon + title + description
- Pricing table: 3 tiers, middle one highlighted with "Popular" badge and ring-2
- Testimonial carousel or grid with avatar + quote + company
- FAQ section using Accordion component
- Final CTA section with gradient background
- Sticky navbar that changes bg-opacity on scroll

## Task Manager / Kanban
- Kanban columns: flex gap-4, each column bg-zinc-900 rounded-xl p-4
- Cards: compact, show title + assignee avatar + priority dot + due date
- Drag handle: grip-vertical icon, cursor-grab
- Column headers: title + count badge + "+" add button
- Priority indicators: colored dots (red=urgent, orange=high, blue=normal, gray=low)
- Quick-add: click "+" to show inline input at bottom of column
