# Visual Quality Reference — BuilderAI

Apply these CSS patterns to make generated apps look production-grade and visually impressive.

## Glassmorphism
```
bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl
```
Use for: floating cards, navbars, modals on dark backgrounds.

## Gradient Text (Hero Headlines)
```
bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent
```
Variations by accent:
- violet: `from-violet-400 to-fuchsia-400`
- blue: `from-blue-400 to-cyan-400`
- emerald: `from-emerald-400 to-teal-400`
- orange: `from-orange-400 to-amber-400`
- rose: `from-rose-400 to-pink-400`

## Glow Effects
Subtle glow on accent elements:
```
shadow-[0_0_30px_rgba(139,92,246,0.3)]    /* violet glow */
shadow-[0_0_30px_rgba(59,130,246,0.3)]     /* blue glow */
shadow-[0_0_30px_rgba(16,185,129,0.3)]     /* emerald glow */
```
Use for: primary buttons, hero CTA, active states.

## Card Hover (Elevated Style)
```
group rounded-2xl bg-zinc-900 border border-zinc-800
hover:border-violet-500/50 hover:shadow-xl hover:shadow-violet-500/10
hover:-translate-y-1 transition-all duration-300
```

## Smooth Scroll (globals.css)
```css
html { scroll-behavior: smooth; }
```

## Micro-Interactions
- Buttons: `active:scale-95 transition-transform duration-100`
- Cards: `hover:-translate-y-1 transition-all duration-300`
- Icons: `group-hover:rotate-12 transition-transform`
- Links: `hover:text-violet-400 transition-colors duration-200`
- Badges: `hover:brightness-110 transition`

## Loading Skeletons
```tsx
<div className="animate-pulse space-y-4">
  <div className="h-4 bg-zinc-800 rounded w-3/4" />
  <div className="h-4 bg-zinc-800 rounded w-1/2" />
  <div className="h-32 bg-zinc-800 rounded-xl" />
</div>
```

## Gradient Backgrounds (Hero Sections)
Dark theme:
```
bg-gradient-to-br from-violet-950/50 via-zinc-950 to-zinc-900
```
With mesh effect:
```
bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-zinc-950 to-zinc-950
```

## Status Indicators
```tsx
<span className="flex h-2 w-2">
  <span className="animate-ping absolute h-2 w-2 rounded-full bg-green-400 opacity-75" />
  <span className="relative rounded-full h-2 w-2 bg-green-500" />
</span>
```

## Badge Styles
```
// Subtle
bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full px-3 py-1 text-xs font-medium

// Solid
bg-violet-600 text-white rounded-full px-3 py-1 text-xs font-bold
```

## Typography Scale (Dark Theme)
- Page title: `text-4xl sm:text-5xl font-bold text-white`
- Section title: `text-2xl sm:text-3xl font-bold text-white`
- Card title: `text-lg font-semibold text-zinc-100`
- Body: `text-sm text-zinc-400` or `text-base text-zinc-300`
- Muted: `text-xs text-zinc-500`

## Spacing Rules
- Page padding: `px-4 sm:px-6 lg:px-8`
- Max content width: `max-w-7xl mx-auto`
- Section vertical spacing: `py-16 sm:py-24`
- Card internal padding: `p-6`
- Grid gaps: `gap-4 sm:gap-6`
- Stack spacing: `space-y-4` or `space-y-6`

## Dark Theme Color System
- Background: `bg-zinc-950` (page), `bg-zinc-900` (cards), `bg-zinc-800` (inputs/elevated)
- Borders: `border-zinc-800` (subtle), `border-zinc-700` (visible)
- Text: `text-white` (headings), `text-zinc-300` (body), `text-zinc-500` (muted)
- Accent: `text-violet-400` (links/highlights), `bg-violet-600` (buttons)
