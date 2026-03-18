'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, Terminal, RefreshCw, Zap, Maximize2, Minimize2, X, AlertTriangle, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useSettingsStore } from '@/lib/store/useSettingsStore'

interface WebContainerPreviewProps {
  files: Record<string, string>
  projectName?: string
  projectId?: string
  onWriteFileReady?: (writeFn: (path: string, content: string) => Promise<void>) => void
  onRuntimeErrorsChange?: (errors: string[]) => void
}

type Status =
  | { phase: 'idle' }
  | { phase: 'booting' }
  | { phase: 'installing' }
  | { phase: 'starting' }
  | { phase: 'ready'; url: string }
  | { phase: 'error'; message: string }

// WebContainers singleton — stored on globalThis so it survives HMR/module re-evaluation
// (WebContainer API only allows ONE boot per browsing context)
interface WcGlobal {
  __wcInstance?: import('@webcontainer/api').WebContainer | null
  __wcBooting?: boolean
  __wcLastPkgJson?: string | null
  __wcHasNodeModules?: boolean
}
const g = globalThis as unknown as WcGlobal

// Accessor helpers — read/write from globalThis
function getWc() { return g.__wcInstance ?? null }
function setWc(wc: import('@webcontainer/api').WebContainer | null) { g.__wcInstance = wc }
function isBooting() { return g.__wcBooting ?? false }
function setBooting(v: boolean) { g.__wcBooting = v }
function getLastPkgJson() { return g.__wcLastPkgJson ?? null }
function setLastPkgJson(v: string | null) { g.__wcLastPkgJson = v }
function getHasNodeModules() { return g.__wcHasNodeModules ?? false }
function setHasNodeModules(v: boolean) { g.__wcHasNodeModules = v }

// Strip ANSI escape codes + handle carriage-return line overwrites
function cleanLine(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const noAnsi = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
  // carriage return overwrites — keep only last segment after \r
  const noCr = noAnsi.split('\r').pop() ?? ''
  return noCr.trim()
}

// Translate cryptic SWC/Next.js/webpack build errors into human-readable messages.
// All string literals here are intentionally plain text — no Tailwind class names.
interface TranslatedError { headline: string; detail: string; hint: string }
function translateBuildError(raw: string): TranslatedError | null {
  // Unexpected token — usually truncation or inner-quote JSX parse failure
  const tok = raw.match(/Unexpected token[:\s`]+([^\n]{1,60})/i)
  if (tok) {
    const t = tok[1].trim()
    const isComponent = t.startsWith('<') || /^[A-Z]/.test(t)
    return {
      headline: isComponent ? 'JSX Syntax Error' : 'JavaScript Syntax Error',
      detail: 'Unexpected token: ' + t,
      hint: isComponent
        ? 'A component file may have been truncated mid-JSX. It has been replaced with a stub — the rest of the app still works.'
        : 'A generated file has a syntax problem. Check the Code tab for the affected file.',
    }
  }
  // Module not found with literal "..." — bg-url placeholder leaked
  if (/Module not found.*Can.t resolve\s+['"]\.\.\.['"]/i.test(raw)) {
    return {
      headline: 'Placeholder URL in CSS',
      detail: "Tailwind tried to resolve '...' as a file path",
      hint: 'A generated file used a placeholder CSS class. The Python sanitizer should have removed it — try regenerating.',
    }
  }
  // Module not found — generic missing import
  const mod = raw.match(/Module not found.*Can.t resolve\s+['"]([^'"]+)['"]/i)
  if (mod) {
    return {
      headline: 'Missing Module',
      detail: 'Cannot resolve: ' + mod[1],
      hint: '"' + mod[1] + '" is imported but was not generated or installed. Try regenerating.',
    }
  }
  // is not a function
  const fn = raw.match(/([a-zA-Z_$][a-zA-Z0-9_$.]*) is not a function/i)
  if (fn) {
    return {
      headline: 'Runtime Error: Not a Function',
      detail: '"' + fn[1] + '" was called but is not a function',
      hint: 'A callback prop may be missing or a component import is incorrect.',
    }
  }
  // Cannot read properties of undefined
  if (/Cannot read propert/i.test(raw)) {
    return {
      headline: 'Runtime Error: Null Reference',
      detail: raw.slice(0, 120),
      hint: 'An array or object was undefined when accessed. Check that all state is initialized.',
    }
  }
  // Failed to compile
  if (/Failed to compile/i.test(raw)) {
    return {
      headline: 'Compilation Failed',
      detail: 'Vite could not compile the generated code',
      hint: 'Check the build logs for the specific file and line. Use the Code tab to inspect files.',
    }
  }
  return null
}

// Patch package.json to add any deps missing but referenced in source files
function patchPackageJson(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  let pkg: Record<string, unknown> = {}
  try { pkg = JSON.parse(files['package.json'] ?? '{}') } catch { pkg = {} }

  const deps = (pkg.dependencies as Record<string, string>) ?? {}
  const devDeps = (pkg.devDependencies as Record<string, string>) ?? {}
  const allDeps = { ...deps, ...devDeps }

  // Scan all source files for import statements
  const importedPkgs = new Set<string>()
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(path)) continue
    const matches = content.matchAll(/from ['"](@?[^./'"@][^'"]*)['"]/g)
    for (const m of matches) {
      const pkg = m[1].startsWith('@')
        ? m[1].split('/').slice(0, 2).join('/')
        : m[1].split('/')[0]
      importedPkgs.add(pkg)
    }
  }

  // Known package versions for common deps
  const knownVersions: Record<string, string> = {
    // Supabase
    '@supabase/supabase-js': '^2.39.0',
    '@supabase/ssr': '^0.1.0',
    // UI
    'lucide-react': '^0.344.0',
    'clsx': '^2.1.0',
    'tailwind-merge': '^2.2.1',
    'class-variance-authority': '^0.7.0',
    // 'framer-motion' is intentionally excluded — stripped at source level in fixCommonIssues
    //  because its TypeScript generics cause Turbopack/SWC parse errors in WebContainers.
    'react-icons': '^5.0.1',
    'sonner': '^1.4.0',
    'cmdk': '^0.2.1',
    'embla-carousel-react': '^8.0.0',
    'vaul': '^0.9.0',
    'input-otp': '^1.2.4',
    'react-router-dom': '^6.23.0',
    // Radix UI
    '@radix-ui/react-slot': '^1.0.2',
    '@radix-ui/react-checkbox': '^1.0.4',
    '@radix-ui/react-label': '^2.0.2',
    '@radix-ui/react-dialog': '^1.0.5',
    '@radix-ui/react-dropdown-menu': '^2.0.6',
    '@radix-ui/react-select': '^2.0.0',
    '@radix-ui/react-toast': '^1.1.5',
    '@radix-ui/react-separator': '^1.0.3',
    '@radix-ui/react-tabs': '^1.0.4',
    '@radix-ui/react-tooltip': '^1.0.7',
    '@radix-ui/react-popover': '^1.0.7',
    '@radix-ui/react-avatar': '^1.0.4',
    '@radix-ui/react-switch': '^1.0.3',
    '@radix-ui/react-slider': '^1.1.2',
    '@radix-ui/react-progress': '^1.0.3',
    '@radix-ui/react-scroll-area': '^1.0.5',
    '@radix-ui/react-accordion': '^1.1.2',
    '@radix-ui/react-alert-dialog': '^1.0.5',
    '@radix-ui/react-aspect-ratio': '^1.0.3',
    '@radix-ui/react-collapsible': '^1.0.3',
    '@radix-ui/react-context-menu': '^2.1.5',
    '@radix-ui/react-hover-card': '^1.0.7',
    '@radix-ui/react-menubar': '^1.0.4',
    '@radix-ui/react-navigation-menu': '^1.1.4',
    '@radix-ui/react-radio-group': '^1.1.3',
    '@radix-ui/react-toggle': '^1.0.3',
    '@radix-ui/react-toggle-group': '^1.0.4',
    // Forms & validation
    'uuid': '^9.0.1',
    'date-fns': '^3.3.1',
    'zod': '^3.22.4',
    'react-hook-form': '^7.51.0',
    '@hookform/resolvers': '^3.3.4',
    // Data & charts
    'axios': '^1.6.7',
    'recharts': '^2.12.0',
    'swr': '^2.2.5',
    '@tanstack/react-query': '^5.22.2',
    '@tanstack/react-table': '^8.13.2',
    // Markdown & text
    'react-markdown': '^9.0.1',
    'remark-gfm': '^4.0.0',
    'react-syntax-highlighter': '^15.5.0',
    // DnD & interaction
    '@hello-pangea/dnd': '^16.5.0',
    'react-beautiful-dnd': '^13.1.1',
    '@dnd-kit/core': '^6.1.0',
    '@dnd-kit/sortable': '^8.0.0',
    '@dnd-kit/utilities': '^3.2.2',
    // Animation & misc
    'tailwindcss-animate': '^1.0.7',
    'react-day-picker': '^8.10.0',
    'react-hot-toast': '^2.4.1',
    'zustand': '^4.5.1',
    'nanoid': '^5.0.5',
    'lodash': '^4.17.21',
    'dayjs': '^1.11.10',
    'moment': '^2.30.1',
  }

  let changed = false
  for (const pkg of importedPkgs) {
    // Skip built-ins and relative imports
    if (pkg.startsWith('.') || pkg.startsWith('/')) continue
    if (['react', 'react-dom', 'path', 'fs', 'crypto', 'stream', 'http', 'https', 'os', 'util', 'events', 'buffer'].includes(pkg)) continue
    if (allDeps[pkg]) continue // already present

    const version = knownVersions[pkg] ?? 'latest'
    deps[pkg] = version
    changed = true
  }

  if (changed) {
    pkg.dependencies = deps
    patched['package.json'] = JSON.stringify(pkg, null, 2)
  }

  return patched
}

// Replace supabase calls with a simple in-memory mock so the app renders
function mockSupabaseClient(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  const supabaseMock = `// Supabase mock for WebContainer preview
const mockData: Record<string, unknown[]> = {}

// Auto-generate sample rows when a table is first queried
function ensureSeedData(table: string) {
  if (mockData[table]) return
  const id1 = crypto.randomUUID()
  const id2 = crypto.randomUUID()
  const id3 = crypto.randomUUID()
  const now = new Date().toISOString()
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString()
  mockData[table] = [
    { id: id1, created_at: twoDaysAgo, updated_at: twoDaysAgo, user_id: 'preview-user', name: 'Sample ' + table + ' 1', title: 'First Item', description: 'This is a sample item for preview', content: 'Sample content for preview', status: 'active', completed: false, done: false, priority: 'medium', category: 'general', color: '#3b82f6', count: 5, value: 42, date: twoDaysAgo, email: 'user@example.com', text: 'Hello World', label: 'Important', slug: 'sample-1', order: 0, is_active: true },
    { id: id2, created_at: yesterday, updated_at: yesterday, user_id: 'preview-user', name: 'Sample ' + table + ' 2', title: 'Second Item', description: 'Another sample item', content: 'More preview content here', status: 'pending', completed: true, done: true, priority: 'high', category: 'work', color: '#ef4444', count: 12, value: 87, date: yesterday, email: 'admin@example.com', text: 'Preview Mode', label: 'Urgent', slug: 'sample-2', order: 1, is_active: true },
    { id: id3, created_at: now, updated_at: now, user_id: 'preview-user', name: 'Sample ' + table + ' 3', title: 'Third Item', description: 'Yet another sample', content: 'Third piece of content', status: 'complete', completed: false, done: false, priority: 'low', category: 'personal', color: '#22c55e', count: 3, value: 15, date: now, email: 'test@example.com', text: 'Test Data', label: 'Optional', slug: 'sample-3', order: 2, is_active: false },
  ]
}

function makeQueryBuilder(table: string, _filters: Record<string,unknown> = {}) {
  ensureSeedData(table)
  const self: Record<string, unknown> = {
    select: (_cols?: string) => makeQueryBuilder(table, _filters),
    insert: (data: unknown) => {
      if (!mockData[table]) mockData[table] = []
      const arr = Array.isArray(data) ? data : [data]
      const rows = arr.map((r: Record<string, unknown>) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...r
      }))
      mockData[table].push(...rows)
      // Return a builder so .select() chaining works after insert
      return makeQueryBuilder(table)
    },
    update: (data: Record<string, unknown>) => {
      const updated = (mockData[table] ?? []).map((row: Record<string, unknown>) => ({
        ...row, ...data, updated_at: new Date().toISOString()
      }))
      mockData[table] = updated
      return makeQueryBuilder(table)
    },
    delete: () => makeQueryBuilder(table),
    upsert: (data: unknown) => {
      if (!mockData[table]) mockData[table] = []
      const arr = Array.isArray(data) ? data : [data]
      const rows = arr.map((r: Record<string, unknown>) => ({
        id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r
      }))
      mockData[table].push(...rows)
      return makeQueryBuilder(table)
    },
    eq: (_col: string, _val: unknown) => makeQueryBuilder(table, { ..._filters }),
    neq: () => makeQueryBuilder(table),
    gt:  () => makeQueryBuilder(table),
    gte: () => makeQueryBuilder(table),
    lt:  () => makeQueryBuilder(table),
    lte: () => makeQueryBuilder(table),
    like: () => makeQueryBuilder(table),
    ilike: () => makeQueryBuilder(table),
    in: () => makeQueryBuilder(table),
    order: () => makeQueryBuilder(table),
    limit: () => makeQueryBuilder(table),
    range: () => makeQueryBuilder(table),
    single: () => Promise.resolve({ data: (mockData[table] ?? [])[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: (mockData[table] ?? [])[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: mockData[table] ?? [], error: null }),
  }
  return self
}

export const supabase = {
  from: (table: string) => makeQueryBuilder(table),
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'preview-user', email: 'preview@example.com' } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: null, error: null }),
    signUp: () => Promise.resolve({ data: null, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },
}

export function createClient() { return supabase }
export function createServerClient() { return supabase }
export function createBrowserClient() { return supabase }
`

  // Replace supabase client files with the mock
  for (const path of Object.keys(patched)) {
    if (path.includes('supabase/client') || path.includes('supabase/server')) {
      patched[path] = supabaseMock
    }
  }

  return patched
}


// Fix common issues that prevent complex apps from rendering in WebContainer
// Generates a deterministic SVG placeholder based on the image alt/src text.
// Used as the onError fallback when an external image fails to load in WebContainer.
function makeSvgPlaceholder(seed: string): string {
  // Pick a hue from the seed string
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 40) % 360
  // First two words of the label, max 18 chars
  const label = seed.replace(/[^a-zA-Z0-9 ]/g, ' ').split(/\s+/).slice(0, 2).join(' ').slice(0, 18)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='hsl(${h1},60%25,70%25)'/><stop offset='100%25' stop-color='hsl(${h2},60%25,55%25)'/></linearGradient></defs><rect width='400' height='300' fill='url(%23g)'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,sans-serif' font-size='18' font-weight='600' fill='rgba(255,255,255,0.9)'>${label}</text></svg>`
  return `data:image/svg+xml,${svg}`
}

// Inject image fallback handling into all component/page files.
// When an external image (picsum, unsplash, etc.) fails to load inside
// WebContainer's sandboxed iframe, the onError handler swaps in a generated
// SVG placeholder so product cards never show blank white boxes.
function fixImageLoading(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    // Only touch app pages and components, not config/api routes
    if (!/^(src\/)?(app|pages|components)\//.test(path)) continue
    if (/\/route\.(ts|tsx|js)$/.test(path)) continue

    let fixed = content

    // 1. Replace next/image <Image> with plain <img> — next/image requires domain
    //    whitelisting in next.config.js and doesn't work with external URLs in WebContainer.
    //    Pattern: import Image from 'next/image'  →  remove, then replace <Image ... /> with <img ... />
    if (fixed.includes("from 'next/image'") || fixed.includes('from "next/image"')) {
      fixed = fixed
        .replace(/import\s+\w+\s+from\s+['"]next\/image['"]\s*;?\n?/g, '')
        .replace(/import\s*\{\s*\w+\s*\}\s*from\s*['"]next\/image['"]\s*;?\n?/g, '')
      // Replace <Image with <img and remove Next.js-specific props
      fixed = fixed.replace(/<Image\b([^>]*?)\/>/g, (_, props) => {
        // Remove fill, priority, quality, placeholder, blurDataURL — not valid on <img>
        const cleaned = props
          .replace(/\b(fill|priority|quality|placeholder|blurDataURL|loader|unoptimized)\s*=\s*\{[^}]*\}/g, '')
          .replace(/\b(fill|priority|quality|placeholder|blurDataURL|loader|unoptimized)\s*=\s*"[^"]*"/g, '')
          .replace(/\b(fill|priority|unoptimized)\b/g, '')
          .trim()
        return `<img ${cleaned}/>`
      })
      fixed = fixed.replace(/<Image\b([^>]*?)>([\s\S]*?)<\/Image>/g, (_, props) => {
        const cleaned = props
          .replace(/\b(fill|priority|quality|placeholder|blurDataURL|loader|unoptimized)\s*=\s*\{[^}]*\}/g, '')
          .replace(/\b(fill|priority|quality|placeholder|blurDataURL|loader|unoptimized)\s*=\s*"[^"]*"/g, '')
          .replace(/\b(fill|priority|unoptimized)\b/g, '')
          .trim()
        return `<img ${cleaned}/>`
      })
    }

    // 1b. Replace next/link <Link> with plain <a> — no Next.js router in Vite
    if (fixed.includes("from 'next/link'") || fixed.includes('from "next/link"')) {
      fixed = fixed
        .replace(/import\s+\w+\s+from\s+['"]next\/link['"]\s*;?\n?/g, '')
        .replace(/<Link\b([^>]*?)>/g, '<a$1>')
        .replace(/<\/Link>/g, '</a>')
    }

    // 1c. Replace next/navigation hooks with browser-native stubs
    if (fixed.includes("from 'next/navigation'") || fixed.includes('from "next/navigation"')) {
      fixed = fixed
        .replace(/import\s*\{[^}]*\}\s*from\s*['"]next\/navigation['"]\s*;?\n?/g, '')
      const stubs = `const useRouter = () => ({ push: (p: string) => { window.location.href = p }, back: () => window.history.back(), replace: (p: string) => { window.location.href = p } });\nconst usePathname = () => window.location.pathname;\nconst useSearchParams = () => new URLSearchParams(window.location.search);\nconst useParams = () => ({});\nconst redirect = (p: string) => { window.location.href = p };\n`
      fixed = stubs + fixed
    }

    // 1d. Strip next/font imports and font config usages
    if (fixed.includes('next/font')) {
      fixed = fixed
        .replace(/import\s*\{[^}]*\}\s*from\s*['"]next\/font\/[^'"]+['"]\s*;?\n?/g, '')
        .replace(/const\s+\w+\s*=\s*\w+\(\{[\s\S]*?\}\)\s*;?\n?/g, (match) => {
          if (match.includes('subsets') || match.includes('weight')) return ''
          return match
        })
        .replace(/\bclassName=\{[^}]*\.className[^}]*\}/g, 'className=""')
    }

    // 1e. Catch-all: strip any remaining next/* imports
    fixed = fixed.replace(/^\s*import\s+.*\s+from\s+['"]next\/[^'"]+['"]\s*;?\s*$/gm, '')

    // 2a. Strip any existing onError handlers that contain inline SVG/data-URI blobs.
    //     These are generated by the LLM with conflicting quote styles (e.g. xmlns='...'
    //     inside a single-quoted string) which Babel refuses to parse.
    //     The handler ends with }} (arrow fn close + JSX attr close) so we use a
    //     non-greedy [\s\S]*? match that stops at the first }} on the same line.
    fixed = fixed.split('\n').map(line => {
      if (line.includes('onError') && (line.includes('data:image/svg') || line.includes('encodeURIComponent') || line.includes('svg+xml'))) {
        // Remove the entire onError={\s*...\s*}} attribute; fixImageLoading re-injects a clean one
        return line.replace(/\s*\bonError=\{[\s\S]*?\}\}/g, '')
      }
      return line
    }).join('\n')

    // 2. Add onError fallback to every <img> tag that has a src but no onError.
    //    The fallback generates an SVG placeholder from the alt text so product
    //    cards always show something meaningful instead of a blank box.
    fixed = fixed.replace(/<img\b([^>]*?)\/>/g, (match, props) => {
      if (props.includes('onError')) return match  // already has fallback
      if (!props.includes('src')) return match      // no src, skip
      // Extract alt value for the placeholder label
      const altMatch = props.match(/alt\s*=\s*\{([^}]+)\}/) || props.match(/alt\s*=\s*"([^"]+)"/)
      const altExpr = altMatch ? altMatch[1] : "'img'"
      const placeholderFn = `(e)=>{e.currentTarget.onerror=null;const a=${altExpr.includes("'") || altExpr.includes('"') ? altExpr : `e.currentTarget.alt||'img'`};let h=0;for(let i=0;i<a.length;i++)h=a.charCodeAt(i)+((h<<5)-h);const h1=Math.abs(h)%360,h2=(h1+40)%360,lbl=a.replace(/[^a-zA-Z0-9 ]/g,' ').split(/\\s+/).slice(0,2).join(' ').slice(0,18);const svg=\`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='hsl(\${h1},60%,70%)'/><stop offset='100%' stop-color='hsl(\${h2},60%,55%)'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='system-ui,sans-serif' font-size='18' font-weight='600' fill='rgba(255,255,255,0.9)'>\${lbl}</text></svg>\`;e.currentTarget.src='data:image/svg+xml,'+encodeURIComponent(svg)}`
      return `<img${props} onError={${placeholderFn}}/>`
    })

    if (fixed !== content) patched[path] = fixed
  }

  return patched
}

// Maps Tailwind color names → shadcn/ui-compatible HSL values for --primary / --ring
const ACCENT_HSL: Record<string, { primary: string; primaryFg: string }> = {
  violet:  { primary: '262.1 83.3% 57.8%',  primaryFg: '210 20% 98%' },
  purple:  { primary: '271.5 81.3% 55.9%',  primaryFg: '210 20% 98%' },
  indigo:  { primary: '234.5 89.5% 63.9%',  primaryFg: '210 20% 98%' },
  blue:    { primary: '217.2 91.2% 59.8%',  primaryFg: '222.2 47.4% 11.2%' },
  sky:     { primary: '198.7 88.7% 48.4%',  primaryFg: '210 20% 98%' },
  cyan:    { primary: '189 94.5% 42.9%',    primaryFg: '210 20% 98%' },
  teal:    { primary: '172.4 66% 50.4%',    primaryFg: '210 20% 98%' },
  emerald: { primary: '160 84.1% 39.2%',    primaryFg: '355.7 100% 97.3%' },
  green:   { primary: '142.1 76.2% 36.3%',  primaryFg: '355.7 100% 97.3%' },
  lime:    { primary: '84.3 100% 37.3%',    primaryFg: '0 0% 9%' },
  yellow:  { primary: '47.9 95.8% 53.1%',   primaryFg: '0 0% 9%' },
  amber:   { primary: '37.7 92.1% 50.2%',   primaryFg: '0 0% 9%' },
  orange:  { primary: '24.6 95% 53.1%',     primaryFg: '60 9.1% 97.8%' },
  red:     { primary: '0 72.2% 50.6%',      primaryFg: '210 20% 98%' },
  rose:    { primary: '346.8 77.2% 49.8%',  primaryFg: '355.7 100% 97.3%' },
  pink:    { primary: '330 81.2% 60.4%',    primaryFg: '355.7 100% 97.3%' },
  fuchsia: { primary: '292.2 84.1% 60.6%',  primaryFg: '210 20% 98%' },
}

/**
 * Detect the dominant accent color used in the generated code and patch the
 * CSS --primary variable in globals.css so shadcn/ui components (Button, Badge,
 * etc.) render in the correct accent color instead of the default near-black.
 */
function patchAccentColors(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  // Find globals.css
  const cssKey = Object.keys(patched).find(k => k.endsWith('globals.css') || k.endsWith('global.css') || k.endsWith('index.css'))
  if (!cssKey) return patched

  const css = patched[cssKey]

  // If --primary is already non-default (not the grayscale 240-range values), leave it
  const defaultPrimaryRe = /--primary:\s*24[0-9]/
  if (!defaultPrimaryRe.test(css)) return patched

  // Scan all TSX/JSX for the most-used accent color class (bg-X-N, text-X-N, from-X-N)
  const allCode = Object.entries(patched)
    .filter(([p]) => /\.(tsx|jsx)$/.test(p))
    .map(([, c]) => c)
    .join('\n')

  let detected: string | null = null
  let maxCount = 0
  for (const color of Object.keys(ACCENT_HSL)) {
    const count = (allCode.match(new RegExp(`-${color}-[3-9]`, 'g')) ?? []).length
    if (count > maxCount) { maxCount = count; detected = color }
  }

  if (!detected || maxCount < 2) return patched  // not enough signal

  const { primary, primaryFg } = ACCENT_HSL[detected]

  // Replace --primary and --primary-foreground in :root block
  patched[cssKey] = css
    .replace(/(--primary:\s*)[^\n;]+/, `$1${primary};`)
    .replace(/(--primary-foreground:\s*)[^\n;]+/, `$1${primaryFg};`)
    // Also update --ring to match primary so focus rings use the accent color
    .replace(/(--ring:\s*)[^\n;]+/, `$1${primary};`)

  return patched
}


/**
 * Detect truncated TSX/TS files using the same heuristics as Python's is_truncated().
 * Returns true if the file appears cut off mid-expression.
 */
function isTruncatedTsx(content: string): boolean {
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 10) return false
  const last = lines[lines.length - 1].trim()

  // Short alpha-only ending = partial identifier (e.g. "use", "key", "Java")
  if (last.length <= 5 && /^[a-zA-Z_-]+$/.test(last)) return true

  // Mid-expression line ending
  if (/[=({,+&|?:<\[]$/.test(last)) return true

  // Unmatched brace/paren count
  // Count only in non-comment, non-string context is hard — use raw counts with tight tolerance.
  // op===1 with last line being "}" = file ends with function close but return(...) never closed.
  const ob = (content.match(/\{/g) ?? []).length - (content.match(/\}/g) ?? []).length
  const op = (content.match(/\(/g) ?? []).length - (content.match(/\)/g) ?? []).length
  if (ob > 2 || op > 2) return true
  // Specific pattern: function closes with } but JSX return( was never closed
  if (op === 1 && (last === '}' || last === '})' || last === '};')) return true

  // No valid statement terminator on the last line
  if (!/[});\]>'"]$/.test(last)) return true

  // Opening JSX tag at end of file = truncated mid-JSX.
  // Valid: ends with /> (self-closing) or </tag> (closing). Plain <tag ...> = truncated.
  if (last.endsWith('>') && !last.endsWith('/>') && !/<\/\w/.test(last)) return true

  return false
}

/** Detect files where the LLM accidentally wrote reasoning/prose instead of code. */
function isNaturalLanguageTsx(content: string): boolean {
  const firstLine = content.split('\n').find(l => l.trim().length > 0) ?? ''
  const t = firstLine.trim()
  // Code files always start with a keyword or special character
  if (/^(import|export|const|let|var|type|interface|function|class|\/\/|\/\*|#!|['"`{(<])/.test(t)) return false
  // Natural language: starts with an uppercase word + space (sentence-like)
  // but not TypeScript identifiers like React, Props, State, etc.
  if (/^[A-Z][a-z]+ /.test(t) && !/^(React|ReactDOM|Props|State|Type|Interface|Class|Enum|Default|The\s+(?:error|issue|problem|file|component))/.test(t)) return true
  // Also catch lines starting with "The error", "Looking more carefully", etc.
  if (/^(The |Looking |Note |This |It |We |An |A [a-z])/.test(t)) return true
  return false
}

/**
 * Replace truncated TSX/TS files with minimal compilable stubs so SWC never sees
 * a broken file. Stubs use React.createElement (not JSX) and inline styles only —
 * no Tailwind class literals that could be picked up by Tailwind's content scanner.
 * Skips components/ui/* (always overwritten by injectShadcnComponents).
 */
function stubTruncatedFiles(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  // Strip null bytes, BOM, and non-printable control chars from all source files.
  // The LLM occasionally emits \0 or a UTF-8 BOM when it truncates output, which
  // makes Babel throw "Unexpected token (N:0)" on an otherwise-valid file.
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx?|jsx?)$/.test(path)) continue
    // eslint-disable-next-line no-control-regex
    const cleaned = content.replace(/\uFEFF/g, '').replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    if (cleaned !== content) patched[path] = cleaned
  }

  // Inline style string — no Tailwind classes, so scanner-safe
  const stubStyle = "{padding:'1rem',border:'1px dashed #6b7280',borderRadius:'6px',color:'#9ca3af',fontSize:'14px',fontFamily:'monospace'}"

  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx|ts)$/.test(path)) continue
    if (path.includes('components/ui/')) continue      // always overwritten
    if (/\/(route|middleware|layout)\.(tsx|ts)$/.test(path)) continue  // skip special files
    if (!isTruncatedTsx(content) && !isNaturalLanguageTsx(content)) continue

    const filename = path.split('/').pop() ?? path
    const baseName = filename.replace(/\.(tsx|ts)$/, '')
    const compName = baseName.charAt(0).toUpperCase() + baseName.slice(1)

    // Scan for named exports declared before the truncation point
    const namedExports: string[] = []
    const namedRe = /export\s+(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)/g
    let m: RegExpExecArray | null
    while ((m = namedRe.exec(content)) !== null) namedExports.push(m[1])

    // Build a stub using React.createElement — avoids JSX attribute scanning entirely
    const out: string[] = ["import React from 'react'", '']
    for (const name of namedExports) {
      if (/^use[A-Z]/.test(name)) {
        // Hook stub — return empty object
        out.push(`export function ${name}() { return {} }`)
      } else {
        out.push(
          `export function ${name}() {`,
          `  return React.createElement('div',{style:${stubStyle}},'[${name} loading]')`,
          `}`
        )
      }
    }
    out.push(
      `export default function ${compName}() {`,
      `  return React.createElement('div',{style:${stubStyle}},'[${compName} loading]')`,
      `}`
    )
    patched[path] = out.join('\n')
  }

  return patched
}

function fixCommonIssues(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  // 1. Remove middleware.ts — Vite has no middleware concept
  for (const key of Object.keys(patched)) {
    if (/^(src\/)?middleware\.(ts|js|tsx)$/.test(key)) {
      delete patched[key]
    }
  }

  // 2. (next/font removed — Vite uses CSS @import for fonts)

  // 3. tailwind.config.js is always force-written in step 4 below — no need to create here

  // 4. Ensure postcss.config exists
  const hasPostcss = Object.keys(patched).some(k =>
    /^postcss\.config\.(js|mjs|cjs)$/.test(k)
  )
  if (!hasPostcss) {
    patched['postcss.config.js'] = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`
  }

  // 5. Ensure globals.css / index.css has @tailwind directives
  const globalsCssKey = Object.keys(patched).find(k =>
    k.endsWith('globals.css') || k.endsWith('global.css') || k.endsWith('index.css')
  )
  if (globalsCssKey) {
    let css = patched[globalsCssKey]
    if (!css.includes('@tailwind')) {
      css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${css}`
    }
    // If CSS vars are missing, inject the full shadcn/ui variable block so
    // border-border / bg-background / text-foreground resolve correctly.
    if (!css.includes('--background')) {
      css = css + `
@layer base {
  :root {
    --background: 0 0% 100%; --foreground: 240 10% 3.9%;
    --card: 0 0% 100%; --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%; --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%; --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%; --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%; --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%; --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%; --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%; --input: 240 5.9% 90%;
    --ring: 240 10% 3.9%; --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%; --foreground: 0 0% 98%;
    --card: 240 10% 3.9%; --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%; --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%; --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%; --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%; --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%; --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%; --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%; --input: 240 3.7% 15.9%; --ring: 240 4.9% 83.9%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}`
    }
    patched[globalsCssKey] = css
  } else {
    // Create index.css if missing — detect theme from generated files
    const allContent = Object.values(patched).join('\n')
    // Light theme if they use white/gray bg classes (bg-white, bg-gray-*, bg-slate-*)
    const isLightTheme = /bg-white|bg-gray-[1-9]|bg-slate-[1-9]|bg-neutral-[1-9]/.test(allContent)
    patched['src/index.css'] = isLightTheme
      ? `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 10% 3.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
`
      : `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --radius: 0.5rem;
  }
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
`
  }

  // 6. Ensure src/main.tsx imports index.css
  const mainKey = Object.keys(patched).find(k =>
    /^src\/main\.(tsx|jsx|ts|js)$/.test(k)
  )
  if (mainKey) {
    const main = patched[mainKey]
    if (!main.includes('index.css') && !main.includes('globals.css')) {
      patched[mainKey] = `import './index.css'\n${main}`
    }
  }

  // 6b. Fix inline SVG data URIs in className that contain unescaped double quotes.
  //     Pattern: bg-[url('data:image/svg+xml,...width="60"...')] — the inner "60" terminates className="...".
  //     Fix: strip the entire bg-[url('data:image/svg+xml,...')] class or replace quotes with %22.
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    if (!content.includes('data:image/svg+xml')) continue
    // Remove bg-[url('data:image/svg+xml,...')] patterns from className strings
    const fixed = content.replace(/bg-\[url\(['"]data:image\/svg\+xml[^'"]*['"]\)\]/g, 'bg-transparent')
    if (fixed !== content) patched[path] = fixed
  }

  // 7. Strip 'use client' — not needed in Vite
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx|ts|js)$/.test(path)) continue
    if (content.trimStart().startsWith("'use client'") || content.trimStart().startsWith('"use client"')) {
      patched[path] = content.replace(/^['"]use client['"]\s*;?\s*\n*/m, '')
    }
  }

  // 8. Runtime safety: fix undefined.map() and onXxx is not a function crashes.
  //    These are the two most common errors in generated multi-component apps:
  //
  //    a) Array prop passed as undefined then .map() called on it:
  //       {items.map(...)}  →  {(items ?? []).map(...)}
  //       Also covers filter/forEach/find/reduce on potentially-undefined arrays.
  //
  //    b) Callback prop not passed by parent then called as function:
  //       onSearch(val)  →  onSearch?.(val)
  //       Prevents "onSearch is not a function" when prop is optional/missing.
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    if (!/^(src\/)?(app|pages|components)\//.test(path)) continue
    if (/\/route\.(ts|tsx|js)$/.test(path)) continue

    let fixed = content

    // a) Safe array iteration in JSX: {arr.map( → {(arr ?? []).map(
    //    Also handles: && arr.map(  and  (arr.filter().map(  chains
    fixed = fixed.replace(
      /\{([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*(map|filter|forEach|find|reduce|some|every|flatMap)\s*\(/g,
      '{($1 ?? []).$2('
    )
    fixed = fixed.replace(
      /&&\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\.\s*(map|filter|forEach|find|reduce|some|every|flatMap)\s*\(/g,
      '&& ($1 ?? []).$2('
    )

    // b) Safe callback invocation: onXxx( → onXxx?.(
    //    Negative lookbehind for word chars avoids matching function definitions
    //    like "function onSearch(" or "const onSearch = ("
    //    The [^=] ensures we don't touch JSX prop assignments like onSearch={...}
    fixed = fixed.replace(
      /(?<![a-zA-Z_$0-9=])(on[A-Z][a-zA-Z0-9]*)\s*\(/g,
      '$1?.('
    )

    if (fixed !== content) patched[path] = fixed
  }

  // 9. Auto-stub missing components.
  //    The frontend agent often imports components it forgot to generate.
  //    Scan every file for @/components/... and @/lib/... imports, check if the
  //    file exists in the generated set, and create a working stub for anything
  //    missing. This prevents "Module not found: Can't resolve '@/components/Foo'"
  //    build errors from blocking the entire preview.
  const allFilePaths = new Set(Object.keys(patched))

  // Normalize a path alias to a filesystem key (try .tsx then .ts then /index.tsx)
  function resolveAlias(importPath: string): string | null {
    const base = importPath.replace(/^@\//, '')
    const candidates = [
      base,
      `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`,
      `${base}/index.tsx`, `${base}/index.ts`, `${base}/index.jsx`,
    ]
    return candidates.find(c => allFilePaths.has(c)) ?? null
  }

  // Collect all @/ imports across every source file
  const importPattern = /from\s+['"](@\/[^'"]+)['"]/g
  const missingPaths = new Map<string, Set<string>>() // aliasPath → set of named exports

  for (const content of Object.values(patched)) {
    let m: RegExpExecArray | null
    importPattern.lastIndex = 0
    while ((m = importPattern.exec(content)) !== null) {
      const aliasPath = m[1]
      if (!resolveAlias(aliasPath)) {
        if (!missingPaths.has(aliasPath)) missingPaths.set(aliasPath, new Set())
      }
    }
  }

  // For each missing path, collect what named/default exports are imported from it
  for (const [aliasPath, exports] of missingPaths) {
    // named imports: import { Foo, Bar } from '@/...'
    const namedRe = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*['"]${aliasPath.replace(/\//g, '\\/')}['"]`, 'g')
    // default imports: import Foo from '@/...'
    const defaultRe = new RegExp(`import\\s+(\\w+)\\s+from\\s*['"]${aliasPath.replace(/\//g, '\\/')}['"]`, 'g')
    for (const content of Object.values(patched)) {
      let m: RegExpExecArray | null
      namedRe.lastIndex = 0
      while ((m = namedRe.exec(content)) !== null) {
        m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean).forEach(e => exports.add(e))
      }
      defaultRe.lastIndex = 0
      while ((m = defaultRe.exec(content)) !== null) {
        exports.add(`__default__${m[1]}`)
      }
    }
  }

  // Generate stubs for every missing file
  for (const [aliasPath, exports] of missingPaths) {
    const fsPath = aliasPath.replace(/^@\//, '') + '.tsx'
    if (allFilePaths.has(fsPath)) continue // was just added above, skip

    const namedExports = [...exports].filter(e => !e.startsWith('__default__'))
    const defaultExports = [...exports].filter(e => e.startsWith('__default__')).map(e => e.replace('__default__', ''))

    // Build stub component lines
    const lines: string[] = ["import React from 'react'", '']

    for (const name of namedExports) {
      // Detect if it looks like a hook (starts with "use") → return empty object/value
      if (/^use[A-Z]/.test(name)) {
        lines.push(`export function ${name}(...args: unknown[]) { return {} as Record<string, unknown> }`)
      } else {
        lines.push(
          `export function ${name}(props: Record<string, unknown> = {}) {`,
          `  return <div data-stub="${name}" style={{padding:'1rem',border:'1px dashed #ccc',borderRadius:'8px',color:'#999',fontSize:'14px'}}>{String(props.children ?? '')}</div>`,
          `}`
        )
      }
    }

    for (const name of defaultExports) {
      lines.push(
        `export default function ${name}(props: Record<string, unknown> = {}) {`,
        `  return <div data-stub="${name}" style={{padding:'1rem',border:'1px dashed #ccc',borderRadius:'8px',color:'#999',fontSize:'14px'}}>{String(props.children ?? '')}</div>`,
        `}`
      )
    }

    // If nothing was collected just export an empty default
    if (namedExports.length === 0 && defaultExports.length === 0) {
      const compName = fsPath.split('/').pop()?.replace(/\.(tsx|ts|jsx|js)$/, '') ?? 'Stub'
      lines.push(
        `export default function ${compName}() {`,
        `  return <div data-stub="${compName}" />`,
        `}`
      )
    }

    patched[fsPath] = lines.join('\n')
  }

  // 10a. Fix duplicate identifier: import Foo + export default function Foo() clash.
  //      The LLM sometimes names the page wrapper function the same as the imported component.
  //      Fix: rename the exported function to avoid the collision.
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx)$/.test(path)) continue
    // Find all default import names: import Foo from '...'
    const importNames = new Set<string>()
    const importRe = /^import\s+([A-Z][a-zA-Z0-9]*)\s+from\s+['"][^'"]+['"]/gm
    let im: RegExpExecArray | null
    while ((im = importRe.exec(content)) !== null) importNames.add(im[1])
    if (importNames.size === 0) continue
    // Check if export default function has same name as an import
    const fnMatch = content.match(/export\s+default\s+function\s+([A-Z][a-zA-Z0-9]*)/)
    if (!fnMatch) continue
    const fnName = fnMatch[1]
    if (!importNames.has(fnName)) continue
    // Rename the function to avoid clash (append Page suffix if not already present)
    const newName = fnName.endsWith('Page') ? fnName + 'View' : fnName + 'Page'
    patched[path] = content.replace(
      new RegExp(`(export\\s+default\\s+function\\s+)${fnName}\\b`),
      `$1${newName}`
    )
  }

  // 10. Fix malformed JSX — missing space between HTML tag name and attribute.
  //     Generation artifacts like <imgsrc= or <divclassName= cause SWC syntax
  //     errors that manifest as confusing "Unexpected token X" messages.
  const HTML_TAGS = new Set([
    'div','span','img','a','button','input','form','label','nav','header','footer',
    'section','article','main','aside','ul','ol','li','p','h1','h2','h3','h4','h5',
    'h6','table','tr','td','th','thead','tbody','tfoot','select','option','textarea',
    'video','audio','canvas','svg','path','g','rect','circle','line','polyline',
    'polygon','text','use','defs','clippath','mask','filter','feblend','pre','code',
    'blockquote','figure','figcaption','details','summary','dialog','slot','template',
  ])
  for (const [filePath, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx)$/.test(filePath)) continue
    const fixed = content.replace(
      /<([a-z][a-z0-9]*)([a-zA-Z][a-zA-Z0-9-]+=)/g,
      (match, tag: string, attr: string) => HTML_TAGS.has(tag) ? `<${tag} ${attr}` : match
    )
    if (fixed !== content) patched[filePath] = fixed
  }

  // 11. Replace process.env references with import.meta.env
  for (const [filePath, content] of Object.entries(patched)) {
    if (!/\.(tsx|jsx|ts|js)$/.test(filePath)) continue
    let fixed = content
    // Replace NEXT_PUBLIC_ env vars with VITE_ equivalents
    fixed = fixed.replace(/process\.env\.NEXT_PUBLIC_(\w+)/g, 'import.meta.env.VITE_$1')
    // Replace remaining process.env.X with empty string (not available in Vite client)
    fixed = fixed.replace(/process\.env\.[A-Z_][A-Z0-9_]*/g, "''")
    if (fixed !== content) patched[filePath] = fixed
  }

  // Step 12 (bg-[url] placeholder stripping) is handled by the Python repair pipeline
  // (repair.py → sanitize_placeholder_classes). Fixing it here in TypeScript would cause
  // Tailwind's content scanner to pick up any matching string literal in this file and
  // generate the very CSS class we're trying to prevent. Python is the safe place for it.

  // Strip framer-motion: its TypeScript generics can cause Turbopack/SWC parse errors.
  // Replace motion.X elements with plain HTML elements and remove animation props.
  for (const [path, content] of Object.entries(patched)) {
    if (!/\.(tsx|ts)$/.test(path)) continue
    if (!content.includes('framer-motion')) continue

    let fixed = content
    // Remove framer-motion imports
    fixed = fixed.replace(/^import\s+.*from\s+['"]framer-motion['"]\s*;?\n?/gm, '')
    // Inject stubs for framer-motion hooks so they don't throw at runtime
    const fmStubs = [
      `const useInView = (_ref?: unknown, _opts?: unknown) => true;`,
      `const useAnimation = () => ({ start: () => {}, stop: () => {}, set: () => {} });`,
      `const useScroll = () => ({ scrollY: { get: () => 0, onChange: () => () => {} }, scrollYProgress: { get: () => 0, onChange: () => () => {} } });`,
      `const useTransform = (_v?: unknown, _i?: unknown, _o?: unknown) => 0;`,
      `const useSpring = (v?: unknown) => v ?? 0;`,
      `const useMotionValue = (v?: unknown) => ({ get: () => v, set: () => {}, onChange: () => () => {} });`,
      `const useReducedMotion = () => false;`,
    ].join('\n')
    fixed = fmStubs + '\n' + fixed
    // Replace motion.X closing tags
    fixed = fixed.replace(/<\/motion\.(\w+)>/g, '</$1>')
    // Replace motion.X opening tags (keep other props, strip animation props)
    fixed = fixed.replace(/<motion\.(\w+)(\s)/g, '<$1$2')
    fixed = fixed.replace(/<motion\.(\w+)>/g, '<$1>')
    fixed = fixed.replace(/<motion\.(\w+)\/>/g, '<$1/>')
    // Remove animation-specific props (inline single-line object values)
    fixed = fixed.replace(/\s+(?:initial|animate|exit|transition|whileHover|whileTap|whileFocus|whileInView|variants|layoutId|layout|drag|dragConstraints|dragElastic|dragMomentum|onAnimationStart|onAnimationComplete)=\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g, '')
    // Replace AnimatePresence
    fixed = fixed.replace(/<AnimatePresence[^>]*>/g, '<>')
    fixed = fixed.replace(/<\/AnimatePresence>/g, '</>')
    patched[path] = fixed
  }

  return patched
}

// ── Legacy Next.js projects: stabilise config without converting to Vite ──────
// Convert a legacy Next.js App Router project to Vite SPA format at preview time.
// This completely bypasses SWC (which is broken in WebContainers) by using esbuild via Vite.
function forceLegacyNextConfig(files: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const USE_CLIENT_RE = /^['"]use client['"]\s*;?\s*\n*/m
  const NEXT_IMPORT_RE = /^\s*import\s+[^'"]*\s+from\s+['"]next\/[^'"]+['"]\s*;?\s*$/mg

  const stripNext = (c: string) =>
    c.replace(USE_CLIENT_RE, '').replace(NEXT_IMPORT_RE, '')

  // ── 1. Remap files to src/ layout ──────────────────────────────────────────
  for (const [path, content] of Object.entries(files)) {
    // Skip Next.js infra files — Vite generates its own
    if (/^next\.config\.[jt]s$|^next\.config\.mjs$/.test(path)) continue
    if (path.startsWith('app/api/') || path.startsWith('pages/api/')) continue
    if (path === 'app/layout.tsx' || path === 'app/layout.ts') continue

    // app/page.tsx  →  src/App.tsx  (rename default export to App)
    if (path === 'app/page.tsx' || path === 'app/page.ts') {
      let c = stripNext(content)
      // Rename the page's default export function to App
      c = c.replace(/export\s+default\s+function\s+\w+\s*\(/, 'export default function App(')
      c = c.replace(/export\s+default\s+async\s+function\s+\w+\s*\(/, 'export default function App(')
      out['src/App.tsx'] = c
      continue
    }

    // app/globals.css  →  src/index.css
    if (path === 'app/globals.css') { out['src/index.css'] = content; continue }

    // components/**  →  src/components/**
    if (path.startsWith('components/')) {
      out['src/' + path] = stripNext(content)
      continue
    }

    // lib/**  →  src/lib/**
    if (path.startsWith('lib/')) {
      out['src/' + path] = stripNext(content)
      continue
    }

    // hooks/**  →  src/hooks/**
    if (path.startsWith('hooks/')) {
      out['src/' + path] = stripNext(content)
      continue
    }

    // styles/**  →  src/styles/**
    if (path.startsWith('styles/')) {
      out['src/' + path] = content
      continue
    }

    // Skip remaining app/ files (loading.tsx, error.tsx, not-found.tsx, etc.)
    if (path.startsWith('app/')) continue

    // Keep config + src/ files as-is
    out[path] = content
  }

  // ── 2. Ensure src/App.tsx exists ───────────────────────────────────────────
  if (!out['src/App.tsx']) {
    out['src/App.tsx'] = `export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold">Welcome</h1>
      <p className="mt-4 text-muted-foreground">Your app is ready.</p>
    </main>
  )
}
`
  }

  // ── 3. Ensure src/main.tsx exists ──────────────────────────────────────────
  if (!out['src/main.tsx']) {
    out['src/main.tsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`
  }

  // ── 4. Ensure index.html exists ────────────────────────────────────────────
  if (!out['index.html']) {
    out['index.html'] = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  }

  // ── 5. Fix @/ imports: Next.js maps @/ → root, Vite maps @/ → src/
  //   After moving components/ → src/components/ and lib/ → src/lib/,
  //   @/components/Foo → src/components/Foo ✓ and @/lib/foo → src/lib/foo ✓
  //   No rewriting needed — forceViteConfig sets alias @/ → ./src/

  // ── 6. Now apply standard Vite config on top ───────────────────────────────
  return forceViteConfig(out)
}

function forceViteConfig(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  // 1. Force vite.config.ts with React plugin and @ alias
  delete patched['next.config.js']
  delete patched['next.config.ts']
  delete patched['next.config.mjs']
  patched['vite.config.ts'] = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
`

  // 2. Force lenient tsconfig
  let tsconfig: Record<string, unknown> = {}
  try { tsconfig = JSON.parse(patched['tsconfig.json'] ?? '{}') } catch { tsconfig = {} }

  const compilerOptions = (tsconfig.compilerOptions as Record<string, unknown>) ?? {}
  compilerOptions.strict = false
  compilerOptions.noEmit = true
  compilerOptions.skipLibCheck = true
  compilerOptions.noUnusedLocals = false
  compilerOptions.noUnusedParameters = false
  compilerOptions.noImplicitAny = false
  compilerOptions.jsx = 'react-jsx'
  // Remove Next.js plugin
  delete compilerOptions.plugins
  compilerOptions.paths = { '@/*': ['./src/*'] }
  tsconfig.compilerOptions = compilerOptions
  tsconfig.include = ['src/**/*.ts', 'src/**/*.tsx', 'vite-env.d.ts']
  patched['tsconfig.json'] = JSON.stringify(tsconfig, null, 2)

  // 3. Normalize package.json scripts + pin tailwindcss to v3
  try {
    const pkg = JSON.parse(patched['package.json'] ?? '{}') as Record<string, unknown>
    const scripts = (pkg.scripts ?? {}) as Record<string, string>
    scripts.dev = 'vite'
    scripts.build = 'vite build'
    scripts.preview = 'vite preview'
    delete scripts.start
    delete scripts.lint
    pkg.scripts = scripts

    const deps = (pkg.dependencies ?? {}) as Record<string, string>
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>

    // Remove Next.js — we use Vite now
    delete deps['next']
    delete devDeps['next']
    delete deps['next-themes']
    delete devDeps['next-themes']

    // Remove framer-motion
    delete deps['framer-motion']
    delete devDeps['framer-motion']

    // Ensure Vite deps exist
    if (!devDeps['vite']) devDeps['vite'] = '^5.4.0'
    if (!devDeps['@vitejs/plugin-react']) devDeps['@vitejs/plugin-react'] = '^4.3.0'

    // Pin tailwindcss to v3
    const twVer = deps['tailwindcss'] ?? devDeps['tailwindcss'] ?? ''
    if (!twVer || /^[\^~]?4/.test(twVer)) {
      deps['tailwindcss'] = '^3.4.0'
    }
    delete deps['@tailwindcss/postcss']
    delete devDeps['@tailwindcss/postcss']
    if (!deps['autoprefixer'] && !devDeps['autoprefixer']) {
      devDeps['autoprefixer'] = '^10.4.0'
    }
    if (!deps['postcss'] && !devDeps['postcss']) {
      devDeps['postcss'] = '^8.0.0'
    }

    pkg.dependencies = deps
    pkg.devDependencies = devDeps
    patched['package.json'] = JSON.stringify(pkg, null, 2)
  } catch { /* leave as-is if JSON is malformed */ }

  // 4. Always force tailwind.config.js with full shadcn/ui color mappings
  if (patched['tailwind.config.ts']) {
    delete patched['tailwind.config.ts']
  }
  patched['tailwind.config.js'] = `/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
    },
  },
  plugins: [],
}
`

  // 5. Force postcss.config.js
  if (patched['postcss.config.ts']) delete patched['postcss.config.ts']
  if (patched['postcss.config.mjs']) delete patched['postcss.config.mjs']
  patched['postcss.config.js'] = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`

  // 6. Normalise CSS: look for globals.css OR index.css and ensure v3 directives
  const cssKey = Object.keys(patched).find(k => k.endsWith('globals.css') || k.endsWith('global.css') || k.endsWith('index.css'))
  if (cssKey) {
    let css = patched[cssKey]
    if (css.includes('@import "tailwindcss"') || css.includes("@import 'tailwindcss'")) {
      css = css
        .replace(/@import\s+['"]tailwindcss['"]\s*;?/g, '')
        .replace(/@import\s+['"]tailwindcss\/[^'"]+['"]\s*;?/g, '')
      if (!css.includes('@tailwind')) {
        css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${css}`
      }
      patched[cssKey] = css
    }
    // Rename to src/index.css if it's a legacy path
    if (cssKey !== 'src/index.css' && !cssKey.endsWith('index.css')) {
      patched['src/index.css'] = patched[cssKey]
      delete patched[cssKey]
    }
  }

  // 7. Ensure Vite entry files exist (legacy Next.js projects won't have them).
  //    Convert app/ structure → src/ structure with react-router-dom for multi-page apps.
  const hasViteEntry = patched['index.html'] && (patched['src/main.tsx'] || patched['src/main.jsx'])
  if (!hasViteEntry) {
    // Collect all Next.js pages: app/page.tsx (home), app/*/page.tsx (sub-pages)
    const subPages: { route: string; name: string; file: string }[] = []
    for (const [p, content] of Object.entries({ ...patched })) {
      const subMatch = p.match(/^app\/([^/]+)\/page\.(tsx|jsx)$/)
      if (subMatch) {
        const slug = subMatch[1]
        const name = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
        let cleaned = content
          .replace(/^['"]use client['"]\s*;?\n*/m, '')
          .replace(/export\s+const\s+metadata\s*=[\s\S]*?(?=\nexport|\nconst|\nfunction|$)/m, '')
          .replace(/export\s+default\s+function\s+\w+/, `export default function ${name}Page`)
        patched[`src/pages/${name}.tsx`] = cleaned
        subPages.push({ route: `/${slug}`, name: `${name}Page`, file: `./pages/${name}` })
        delete patched[p]
      }
      // Delete other app/ files (loading, error, layout variants, etc.)
      if (p.startsWith('app/') && p !== 'app/page.tsx' && p !== 'app/page.jsx' && !p.startsWith('app/api/')) {
        if (!subMatch) delete patched[p]
      }
    }

    // Move app/page.tsx → src/pages/Home.tsx (or src/App.tsx if no sub-pages)
    const pageFile = patched['app/page.tsx'] || patched['app/page.jsx']
    if (pageFile) {
      let homeContent = pageFile
        .replace(/^['"]use client['"]\s*;?\n*/m, '')
        .replace(/export\s+const\s+metadata\s*=[\s\S]*?(?=\nexport|\nconst|\nfunction|$)/m, '')
      if (subPages.length > 0) {
        // Multi-page: home becomes a page component
        homeContent = homeContent.replace(/export\s+default\s+function\s+\w+/, 'export default function HomePage')
        patched['src/pages/Home.tsx'] = homeContent
        subPages.unshift({ route: '/', name: 'HomePage', file: './pages/Home' })
      } else {
        // Single-page: home becomes App directly
        homeContent = homeContent.replace(/export\s+default\s+function\s+\w+/, 'export default function App')
        homeContent = homeContent.replace(/export\s+default\s+\(\)\s*=>/, 'export default function App() { return ')
        patched['src/App.tsx'] = homeContent
      }
    }
    delete patched['app/page.tsx']
    delete patched['app/page.jsx']
    delete patched['app/layout.tsx']
    delete patched['app/layout.jsx']
    delete patched['app/loading.tsx']
    delete patched['app/error.tsx']
    delete patched['app/not-found.tsx']

    // Move all common source dirs → src/*
    for (const [p, content] of Object.entries({ ...patched })) {
      if ((p.startsWith('components/') || p.startsWith('lib/') || p.startsWith('hooks/') ||
           p.startsWith('types/') || p.startsWith('utils/') || p.startsWith('store/') ||
           p.startsWith('context/') || p.startsWith('services/') || p.startsWith('constants/') ||
           p.startsWith('data/')) && !p.startsWith('src/')) {
        const dest = 'src/' + p
        if (!patched[dest]) patched[dest] = content.replace(/^['"]use client['"]\s*;?\n*/m, '')
        delete patched[p]
      }
    }

    // Strip 'use client' and any remaining next/* imports from all src/ files
    for (const [p, content] of Object.entries(patched)) {
      if (p.startsWith('src/') && /\.(tsx?|jsx?)$/.test(p)) {
        patched[p] = content
          .replace(/^['"]use client['"]\s*;?\s*\n*/m, '')
          .replace(/^\s*import\s+.*\s+from\s+['"]next\/[^'"]+['"]\s*;?\s*$/gm, '')
      }
    }

    // Ensure react-router-dom is in deps for multi-page apps
    if (subPages.length > 0) {
      try {
        const pkg = JSON.parse(patched['package.json'] ?? '{}') as Record<string, unknown>
        const deps = (pkg.dependencies ?? {}) as Record<string, string>
        if (!deps['react-router-dom']) deps['react-router-dom'] = '^6.23.0'
        pkg.dependencies = deps
        patched['package.json'] = JSON.stringify(pkg, null, 2)
      } catch {}
    }

    // Generate router-based App.tsx for multi-page apps
    if (subPages.length > 0 && !patched['src/App.tsx']) {
      const imports = subPages.map(p => `import ${p.name} from '${p.file}'`).join('\n')
      const routes = subPages.map(p =>
        p.route === '/' ? `          <Route path="/" element={<${p.name} />} />` : `          <Route path="${p.route}" element={<${p.name} />} />`
      ).join('\n')
      patched['src/App.tsx'] = `import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
${imports}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
${routes}
      </Routes>
    </BrowserRouter>
  )
}
`
    }

    // Fallback src/App.tsx
    if (!patched['src/App.tsx'] && !patched['src/App.jsx']) {
      patched['src/App.tsx'] = `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <h1 className="text-4xl font-bold">App</h1>
    </div>
  )
}`
    }

    // Ensure src/index.css exists
    if (!patched['src/index.css']) {
      patched['src/index.css'] = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
    }

    // Create src/main.tsx
    patched['src/main.tsx'] = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
`

    // Create index.html
    patched['index.html'] = `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body class="dark">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
  }

  return patched
}

// Inject error boundary + postMessage reporter into generated apps
function injectErrorBoundary(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }

  // 1. Add ErrorBoundary component
  patched['src/components/PreviewErrorBoundary.tsx'] = `import React from 'react'

interface State { hasError: boolean; error: Error | null }

export class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      window.parent.postMessage({
        type: '__BUILDERAI_ERROR__',
        error: {
          message: error.message,
          stack: error.stack?.slice(0, 500),
          componentStack: errorInfo.componentStack?.slice(0, 500),
        },
      }, '*')
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#ef4444', background: '#1a1a1a', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h2>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
`

  // 2. Add global error reporter
  patched['src/components/PreviewErrorReporter.tsx'] = `import { useEffect } from 'react'

export function PreviewErrorReporter() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      try {
        window.parent.postMessage({
          type: '__BUILDERAI_ERROR__',
          error: { message: event.message, source: event.filename, line: event.lineno },
        }, '*')
      } catch {}
    }
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      try {
        window.parent.postMessage({
          type: '__BUILDERAI_ERROR__',
          error: { message: String(event.reason), type: 'unhandledrejection' },
        }, '*')
      } catch {}
    }
    window.addEventListener('error', handler)
    window.addEventListener('unhandledrejection', rejectionHandler)
    return () => {
      window.removeEventListener('error', handler)
      window.removeEventListener('unhandledrejection', rejectionHandler)
    }
  }, [])
  return null
}
`

  // 3. Patch src/App.tsx to wrap children with ErrorBoundary
  if (patched['src/App.tsx']) {
    let app = patched['src/App.tsx']
    const importLine = `import { PreviewErrorBoundary } from '@/components/PreviewErrorBoundary'\nimport { PreviewErrorReporter } from '@/components/PreviewErrorReporter'\n`
    // Prepend imports at the very top — this guarantees they land before all other code
    // and avoids the "Unexpected keyword 'import'" error from lastIndexOf finding
    // 'import ' inside a comment, string, or JSX body
    if (!app.includes("from '@/components/PreviewErrorBoundary'")) {
      app = importLine + app
      // Wrap content with ErrorBoundary — handles both {children} and router-based apps
      if (app.includes('{children}')) {
        app = app.replace(
          /\{children\}/,
          '<PreviewErrorBoundary><PreviewErrorReporter />{children}</PreviewErrorBoundary>'
        )
      } else {
        // For router-based or standalone apps, wrap the return JSX
        app = app.replace(
          /return\s*\(\s*\n/,
          'return (\n<PreviewErrorBoundary><PreviewErrorReporter />\n'
        )
        // Close the wrapper before the last closing paren of the return
        const lastReturnClose = app.lastIndexOf('\n  )')
        if (lastReturnClose !== -1) {
          app = app.slice(0, lastReturnClose) + '\n</PreviewErrorBoundary>' + app.slice(lastReturnClose)
        }
      }
    }
    patched['src/App.tsx'] = app
  }

  return patched
}

// Inject shadcn/ui component stubs + lib/utils so generated apps can resolve
// @/components/ui/* and @/lib/utils imports. The frontend agent doesn't generate
// these (they "exist in the template"), but WebContainer only gets the generated files.
function injectShadcnComponents(files: Record<string, string>): Record<string, string> {
  const patched = { ...files }
  const allContent = Object.values(patched).join('\n')

  // lib/utils.ts — needed by every shadcn component and most generated code
  if (!patched['src/lib/utils.ts'] && !patched['src/lib/utils.js'] && !patched['lib/utils.ts'] && !patched['lib/utils.js']) {
    patched['src/lib/utils.ts'] = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }
export function generateId(): string { return Math.random().toString(36).substring(2, 15) }
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}
export function formatRelativeDate(date: string | Date): string {
  const now = new Date(); const then = new Date(date); const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'; if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'; return Math.floor(seconds / 86400) + 'd ago'
}
export function truncate(str: string, length: number): string { return str.length <= length ? str : str.slice(0, length) + '...' }
`
  }

  const STUBS: Record<string, string> = {
    'src/components/ui/button.tsx': `'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default'|'destructive'|'outline'|'secondary'|'ghost'|'link'
  size?: 'default'|'sm'|'lg'|'icon'|'xs'|'icon-sm'|'icon-lg'
  asChild?: boolean
}
const VARIANT: Record<string,string> = {
  default:'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive:'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline:'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  secondary:'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost:'hover:bg-accent hover:text-accent-foreground',
  link:'text-primary underline-offset-4 hover:underline',
}
const SIZE: Record<string,string> = {
  default:'h-9 px-4 py-2',xs:'h-6 px-2 text-xs',sm:'h-8 rounded-md px-3 text-xs',
  lg:'h-10 rounded-md px-8',icon:'h-9 w-9','icon-sm':'h-8 w-8','icon-lg':'h-10 w-10',
}
const Button = React.forwardRef<HTMLButtonElement,ButtonProps>(
  ({className,variant='default',size='default',asChild,children,...props},ref) => (
    <button ref={ref} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',VARIANT[variant]??VARIANT.default,SIZE[size]??SIZE.default,className)} {...props}>{children}</button>
  )
)
Button.displayName='Button'
export {Button}
export const buttonVariants=(o?:{variant?:string;size?:string;className?:string})=>o?.className??''
`,
    'src/components/ui/input.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
const Input=React.forwardRef<HTMLInputElement,React.InputHTMLAttributes<HTMLInputElement>>(
  ({className,type,...props},ref)=>(
    <input type={type} ref={ref} className={cn('flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',className)} {...props}/>
  )
)
Input.displayName='Input'
export {Input}
`,
    'src/components/ui/textarea.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
const Textarea=React.forwardRef<HTMLTextAreaElement,React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({className,...props},ref)=>(
    <textarea ref={ref} className={cn('flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',className)} {...props}/>
  )
)
Textarea.displayName='Textarea'
export {Textarea}
`,
    'src/components/ui/label.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Label=React.forwardRef<HTMLLabelElement,React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({className,...props},ref)=>(
    <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',className)} {...props}/>
  )
)
Label.displayName='Label'
export {Label}
`,
    'src/components/ui/badge.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>{variant?:'default'|'secondary'|'destructive'|'outline'|'ghost'|'link'}
const V:Record<string,string>={default:'bg-primary text-primary-foreground',secondary:'bg-secondary text-secondary-foreground',destructive:'bg-destructive text-destructive-foreground',outline:'text-foreground border border-input',ghost:'',link:'text-primary'}
function Badge({className,variant='default',...props}:BadgeProps){return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',V[variant]??V.default,className)} {...props}/>}
export {Badge}
export const badgeVariants=(o?:{variant?:string;className?:string})=>o?.className??''
`,
    'src/components/ui/card.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
const Card=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('rounded-xl border bg-card text-card-foreground shadow',className)} {...p}/>)
Card.displayName='Card'
const CardHeader=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('flex flex-col space-y-1.5 p-6',className)} {...p}/>)
CardHeader.displayName='CardHeader'
const CardTitle=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('font-semibold leading-none tracking-tight',className)} {...p}/>)
CardTitle.displayName='CardTitle'
const CardDescription=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('text-sm text-muted-foreground',className)} {...p}/>)
CardDescription.displayName='CardDescription'
const CardContent=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('p-6 pt-0',className)} {...p}/>)
CardContent.displayName='CardContent'
const CardFooter=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('flex items-center p-6 pt-0',className)} {...p}/>)
CardFooter.displayName='CardFooter'
const CardAction=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('ml-auto',className)} {...p}/>)
CardAction.displayName='CardAction'
export {Card,CardHeader,CardFooter,CardTitle,CardDescription,CardContent,CardAction}
`,
    'src/components/ui/separator.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
function Separator({className,orientation='horizontal',decorative,...p}:React.HTMLAttributes<HTMLDivElement>&{orientation?:'horizontal'|'vertical';decorative?:boolean}){
  return <div role={decorative?'none':'separator'} aria-orientation={orientation} className={cn('shrink-0 bg-border',orientation==='horizontal'?'h-px w-full':'h-full w-px',className)} {...p}/>
}
export {Separator}
`,
    'src/components/ui/skeleton.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
function Skeleton({className,...props}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('animate-pulse rounded-md bg-muted',className)} {...props}/>}
export {Skeleton}
`,
    'src/components/ui/avatar.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Avatar=React.forwardRef<HTMLSpanElement,React.HTMLAttributes<HTMLSpanElement>>(({className,...p},r)=><span ref={r} className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',className)} {...p}/>)
Avatar.displayName='Avatar'
const AvatarImage=React.forwardRef<HTMLImageElement,React.ImgHTMLAttributes<HTMLImageElement>>(({className,...p},r)=><img ref={r} className={cn('aspect-square h-full w-full object-cover',className)} {...p}/>)
AvatarImage.displayName='AvatarImage'
const AvatarFallback=React.forwardRef<HTMLSpanElement,React.HTMLAttributes<HTMLSpanElement>>(({className,...p},r)=><span ref={r} className={cn('flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium',className)} {...p}/>)
AvatarFallback.displayName='AvatarFallback'
export {Avatar,AvatarImage,AvatarFallback}
`,
    'src/components/ui/checkbox.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'>{onCheckedChange?:(c:boolean)=>void}
const Checkbox=React.forwardRef<HTMLInputElement,CheckboxProps>(({className,onCheckedChange,onChange,...p},r)=>(
  <input type="checkbox" ref={r} className={cn('h-4 w-4 rounded border border-primary text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',className)}
    onChange={e=>{onChange?.(e);onCheckedChange?.(e.target.checked)}} {...p}/>
))
Checkbox.displayName='Checkbox'
export {Checkbox}
`,
    'src/components/ui/switch.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>,'onChange'>{checked?:boolean;onCheckedChange?:(c:boolean)=>void}
const Switch=React.forwardRef<HTMLButtonElement,SwitchProps>(({className,checked,onCheckedChange,...p},r)=>(
  <button ref={r} type="button" role="switch" aria-checked={checked} onClick={()=>onCheckedChange?.(!checked)}
    className={cn('inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',checked?'bg-primary':'bg-input',className)} {...p}>
    <span className={cn('pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform',checked?'translate-x-4':'translate-x-0')}/>
  </button>
))
Switch.displayName='Switch'
export {Switch}
`,
    'src/components/ui/progress.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Progress=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>&{value?:number}>(({className,value=0,...p},r)=>(
  <div ref={r} className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary',className)} {...p}>
    <div className="h-full bg-primary transition-all" style={{width:Math.min(100,Math.max(0,value))+'%'}}/>
  </div>
))
Progress.displayName='Progress'
export {Progress}
`,
    'src/components/ui/slider.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'>{value?:number[];onValueChange?:(v:number[])=>void;min?:number;max?:number;step?:number}
function Slider({className,value,onValueChange,min=0,max=100,step=1,...p}:SliderProps){
  return <input type="range" min={min} max={max} step={step} value={value?.[0]??50} onChange={e=>onValueChange?.([Number(e.target.value)])} className={cn('w-full h-2 accent-primary cursor-pointer',className)} {...p}/>
}
export {Slider}
`,
    'src/components/ui/scroll-area.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const ScrollArea=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,children,...p},r)=>(
  <div ref={r} className={cn('relative overflow-hidden',className)} {...p}>
    <div className="h-full w-full overflow-auto">{children}</div>
  </div>
))
ScrollArea.displayName='ScrollArea'
const ScrollBar=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><div ref={r} className={cn('hidden',className)} {...p}/>)
ScrollBar.displayName='ScrollBar'
export {ScrollArea,ScrollBar}
`,
    'src/components/ui/tabs.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{active:string;set:(v:string)=>void}>({active:'',set:()=>{}})
function Tabs({className,value,defaultValue,onValueChange,children,...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string;defaultValue?:string;onValueChange?:(v:string)=>void}){
  const [a,setA]=React.useState(value??defaultValue??'')
  React.useEffect(()=>{if(value!==undefined)setA(value)},[value])
  const handle=(v:string)=>{setA(v);onValueChange?.(v)}
  return <Ctx.Provider value={{active:a,set:handle}}><div className={cn('',className)} {...p}>{children}</div></Ctx.Provider>
}
function TabsList({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',className)} {...p}/>}
function TabsTrigger({className,value='',...p}:React.ButtonHTMLAttributes<HTMLButtonElement>&{value?:string}){
  const {active,set}=React.useContext(Ctx)
  return <button type="button" onClick={()=>set(value)} data-state={active===value?'active':'inactive'} className={cn('inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',className)} {...p}/>
}
function TabsContent({className,value='',...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string}){
  const {active}=React.useContext(Ctx)
  if(active!==value)return null
  return <div className={cn('mt-2 focus-visible:outline-none',className)} {...p}/>
}
export {Tabs,TabsList,TabsTrigger,TabsContent}
`,
    'src/components/ui/select.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{v:string;set:(s:string)=>void;open:boolean;setOpen:(b:boolean)=>void}>({v:'',set:()=>{},open:false,setOpen:()=>{}})
function Select({value,defaultValue,onValueChange,children}:{value?:string;defaultValue?:string;onValueChange?:(v:string)=>void;children?:React.ReactNode;disabled?:boolean}){
  const [v,setV]=React.useState(value??defaultValue??'')
  const [open,setOpen]=React.useState(false)
  React.useEffect(()=>{if(value!==undefined)setV(value)},[value])
  const handle=(nv:string)=>{setV(nv);onValueChange?.(nv);setOpen(false)}
  return <Ctx.Provider value={{v,set:handle,open,setOpen}}><div className="relative inline-block w-full">{children}</div></Ctx.Provider>
}
function SelectTrigger({className,children,...p}:React.HTMLAttributes<HTMLButtonElement>){
  const {open,setOpen}=React.useContext(Ctx)
  return <button type="button" onClick={()=>setOpen(!open)} className={cn('flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',className)} {...p as React.ButtonHTMLAttributes<HTMLButtonElement>}>{children}<span className="opacity-50">▾</span></button>
}
function SelectValue({placeholder}:{placeholder?:string}){const {v}=React.useContext(Ctx);return <span>{v||placeholder}</span>}
function SelectContent({className,children,...p}:React.HTMLAttributes<HTMLDivElement>&{position?:string}){
  const {open,setOpen}=React.useContext(Ctx)
  if(!open)return null
  return(<>
    <div className="fixed inset-0 z-40" onClick={()=>setOpen(false)}/>
    <div className={cn('absolute z-50 min-w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md mt-1',className)} {...p}>{children}</div>
  </>)
}
function SelectItem({className,value='',...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string}){
  const {set,v}=React.useContext(Ctx)
  return <div className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent',v===value&&'bg-accent/50',className)} onClick={()=>set(value)} {...p}>
    {v===value&&<span className="absolute left-2">✓</span>}{p.children}
  </div>
}
function SelectGroup({children,...p}:React.HTMLAttributes<HTMLDivElement>){return <div {...p}>{children}</div>}
function SelectLabel({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('px-2 py-1.5 text-sm font-semibold',className)} {...p}/>}
function SelectSeparator({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('-mx-1 my-1 h-px bg-muted',className)} {...p}/>}
export {Select,SelectTrigger,SelectValue,SelectContent,SelectItem,SelectGroup,SelectLabel,SelectSeparator}
`,
    'src/components/ui/dialog.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{open:boolean;set:(v:boolean)=>void}>({open:false,set:()=>{}})
function Dialog({open,defaultOpen,onOpenChange,children}:{open?:boolean;defaultOpen?:boolean;onOpenChange?:(v:boolean)=>void;children?:React.ReactNode}){
  const [o,setO]=React.useState(open??defaultOpen??false)
  React.useEffect(()=>{if(open!==undefined)setO(open)},[open])
  const handle=(v:boolean)=>{setO(v);onOpenChange?.(v)}
  return <Ctx.Provider value={{open:o,set:handle}}>{children}</Ctx.Provider>
}
function DialogTrigger({children,asChild,...p}:React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}){
  const {set}=React.useContext(Ctx)
  if(asChild&&React.isValidElement(children))return React.cloneElement(children as React.ReactElement,{onClick:()=>set(true)})
  return <div {...p} onClick={()=>set(true)}>{children}</div>
}
function DialogPortal({children}:{children?:React.ReactNode}){return <>{children}</>}
function DialogOverlay({className,...p}:React.HTMLAttributes<HTMLDivElement>){
  const {open,set}=React.useContext(Ctx)
  if(!open)return null
  return <div className={cn('fixed inset-0 z-50 bg-black/50',className)} onClick={()=>set(false)} {...p}/>
}
function DialogContent({className,children,...p}:React.HTMLAttributes<HTMLDivElement>){
  const {open,set}=React.useContext(Ctx)
  if(!open)return null
  return(<>
    <div className="fixed inset-0 z-50 bg-black/50" onClick={()=>set(false)}/>
    <div className={cn('fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg w-full max-w-lg',className)} {...p}>
      <button type="button" onClick={()=>set(false)} className="absolute right-4 top-4 opacity-70 hover:opacity-100 text-lg">✕</button>
      {children}
    </div>
  </>)
}
function DialogHeader({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left mb-4',className)} {...p}/>}
function DialogFooter({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4',className)} {...p}/>}
function DialogTitle({className,...p}:React.HTMLAttributes<HTMLHeadingElement>){return <h2 className={cn('text-lg font-semibold leading-none tracking-tight',className)} {...p}/>}
function DialogDescription({className,...p}:React.HTMLAttributes<HTMLParagraphElement>){return <p className={cn('text-sm text-muted-foreground',className)} {...p}/>}
function DialogClose({children,...p}:React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}){const {set}=React.useContext(Ctx);return <div {...p} onClick={()=>set(false)}>{children}</div>}
export {Dialog,DialogPortal,DialogOverlay,DialogTrigger,DialogClose,DialogContent,DialogHeader,DialogFooter,DialogTitle,DialogDescription}
`,
    'src/components/ui/alert-dialog.tsx': `'use client'
import * as React from 'react'
import {Dialog,DialogContent,DialogHeader,DialogFooter,DialogTitle,DialogDescription} from '@/components/ui/dialog'
import {cn} from '@/lib/utils'
const AlertDialog=Dialog
const AlertDialogTrigger=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}>(({children,...p},r)=><div ref={r} {...p}>{children}</div>)
AlertDialogTrigger.displayName='AlertDialogTrigger'
const AlertDialogContent=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(({className,...p},r)=><DialogContent className={cn('',className)} ref={r} {...p}/>)
AlertDialogContent.displayName='AlertDialogContent'
const AlertDialogHeader=DialogHeader
const AlertDialogFooter=DialogFooter
const AlertDialogTitle=DialogTitle
const AlertDialogDescription=DialogDescription
function AlertDialogAction({className,...p}:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={cn('inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90',className)} {...p}/>}
function AlertDialogCancel({className,...p}:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={cn('inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent',className)} {...p}/>}
export {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogHeader,AlertDialogFooter,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel}
`,
    'src/components/ui/dropdown-menu.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{open:boolean;set:(v:boolean)=>void}>({open:false,set:()=>{}})
function DropdownMenu({children}:{children?:React.ReactNode}){const [open,setOpen]=React.useState(false);return <Ctx.Provider value={{open,set:setOpen}}><div className="relative inline-block">{children}</div></Ctx.Provider>}
function DropdownMenuTrigger({children,asChild,...p}:React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}){
  const {set,open}=React.useContext(Ctx)
  if(asChild&&React.isValidElement(children))return React.cloneElement(children as React.ReactElement,{onClick:()=>set(!open)})
  return <div {...p} onClick={()=>set(!open)}>{children}</div>
}
function DropdownMenuContent({className,align='end',children,...p}:React.HTMLAttributes<HTMLDivElement>&{align?:string;sideOffset?:number}){
  const {open,set}=React.useContext(Ctx)
  if(!open)return null
  return(<>
    <div className="fixed inset-0 z-50" onClick={()=>set(false)}/>
    <div className={cn('absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md top-full mt-1',align==='end'?'right-0':'left-0',className)} {...p}>{children}</div>
  </>)
}
function DropdownMenuItem({className,inset,...p}:React.HTMLAttributes<HTMLDivElement>&{inset?:boolean}){
  const {set}=React.useContext(Ctx)
  return <div className={cn('relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',inset&&'pl-8',className)} onClick={()=>set(false)} {...p}/>
}
function DropdownMenuLabel({className,inset,...p}:React.HTMLAttributes<HTMLDivElement>&{inset?:boolean}){return <div className={cn('px-2 py-1.5 text-sm font-semibold',inset&&'pl-8',className)} {...p}/>}
function DropdownMenuSeparator({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('-mx-1 my-1 h-px bg-muted',className)} {...p}/>}
function DropdownMenuGroup({children,...p}:React.HTMLAttributes<HTMLDivElement>){return <div {...p}>{children}</div>}
function DropdownMenuSub({children}:{children?:React.ReactNode}){return <>{children}</>}
function DropdownMenuSubTrigger({className,children,...p}:React.HTMLAttributes<HTMLDivElement>&{inset?:boolean}){return <div className={cn('flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm',className)} {...p}>{children} <span className="ml-auto">▶</span></div>}
function DropdownMenuSubContent({className,...p}:React.HTMLAttributes<HTMLDivElement>){return <div className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 shadow-lg',className)} {...p}/>}
function DropdownMenuCheckboxItem({className,children,checked,...p}:React.HTMLAttributes<HTMLDivElement>&{checked?:boolean}){const {set}=React.useContext(Ctx);return <div className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent',className)} onClick={()=>set(false)} {...p}><span className="absolute left-2">{checked?'✓':''}</span>{children}</div>}
function DropdownMenuRadioGroup({children,...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string;onValueChange?:(v:string)=>void}){return <div {...p}>{children}</div>}
function DropdownMenuRadioItem({className,children,...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string}){const {set}=React.useContext(Ctx);return <div className={cn('relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent',className)} onClick={()=>set(false)} {...p}><span className="absolute left-2">●</span>{children}</div>}
function DropdownMenuShortcut({className,...p}:React.HTMLAttributes<HTMLSpanElement>){return <span className={cn('ml-auto text-xs tracking-widest opacity-60',className)} {...p}/>}
function DropdownMenuPortal({children}:{children?:React.ReactNode}){return <>{children}</>}
export {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuGroup,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent,DropdownMenuCheckboxItem,DropdownMenuRadioGroup,DropdownMenuRadioItem,DropdownMenuShortcut,DropdownMenuPortal}
`,
    'src/components/ui/tooltip.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
function TooltipProvider({children}:{children?:React.ReactNode;delayDuration?:number}){return <>{children}</>}
const Ctx=React.createContext<{open:boolean;set:(v:boolean)=>void}>({open:false,set:()=>{}})
function Tooltip({children,open,onOpenChange}:{children?:React.ReactNode;defaultOpen?:boolean;open?:boolean;onOpenChange?:(v:boolean)=>void}){
  const [o,setO]=React.useState(open??false)
  React.useEffect(()=>{if(open!==undefined)setO(open)},[open])
  const handle=(v:boolean)=>{setO(v);onOpenChange?.(v)}
  return <Ctx.Provider value={{open:o,set:handle}}><div className="relative inline-flex">{children}</div></Ctx.Provider>
}
function TooltipTrigger({children,asChild,...p}:React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}){
  const {set}=React.useContext(Ctx)
  return <div onMouseEnter={()=>set(true)} onMouseLeave={()=>set(false)} {...p}>{children}</div>
}
function TooltipContent({className,children,sideOffset,side,...p}:React.HTMLAttributes<HTMLDivElement>&{sideOffset?:number;side?:string}){
  const {open}=React.useContext(Ctx)
  if(!open)return null
  return <div className={cn('absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap',className)} {...p}>{children}</div>
}
export {Tooltip,TooltipTrigger,TooltipContent,TooltipProvider}
`,
    'src/components/ui/popover.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{open:boolean;set:(v:boolean)=>void}>({open:false,set:()=>{}})
function Popover({children,open,defaultOpen,onOpenChange}:{children?:React.ReactNode;open?:boolean;defaultOpen?:boolean;onOpenChange?:(v:boolean)=>void}){
  const [o,setO]=React.useState(open??defaultOpen??false)
  React.useEffect(()=>{if(open!==undefined)setO(open)},[open])
  const handle=(v:boolean)=>{setO(v);onOpenChange?.(v)}
  return <Ctx.Provider value={{open:o,set:handle}}><div className="relative inline-block">{children}</div></Ctx.Provider>
}
function PopoverTrigger({children,asChild,...p}:React.HTMLAttributes<HTMLDivElement>&{asChild?:boolean}){
  const {set,open}=React.useContext(Ctx)
  if(asChild&&React.isValidElement(children))return React.cloneElement(children as React.ReactElement,{onClick:()=>set(!open)})
  return <div {...p} onClick={()=>set(!open)}>{children}</div>
}
function PopoverContent({className,align='center',sideOffset,children,...p}:React.HTMLAttributes<HTMLDivElement>&{align?:string;sideOffset?:number}){
  const {open,set}=React.useContext(Ctx)
  if(!open)return null
  return(<>
    <div className="fixed inset-0 z-40" onClick={()=>set(false)}/>
    <div className={cn('absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none top-full mt-1',align==='end'?'right-0':align==='start'?'left-0':'left-1/2 -translate-x-1/2',className)} {...p}>{children}</div>
  </>)
}
function PopoverAnchor({children,...p}:React.HTMLAttributes<HTMLDivElement>){return <div {...p}>{children}</div>}
export {Popover,PopoverTrigger,PopoverContent,PopoverAnchor}
`,
    'src/components/ui/accordion.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const AccCtx=React.createContext<{expanded:Set<string>;toggle:(v:string)=>void}>({expanded:new Set(),toggle:()=>{}})
const ItemCtx=React.createContext<string>('')
function Accordion({className,type='single',value,defaultValue,onValueChange,collapsible=true,children,...p}:React.HTMLAttributes<HTMLDivElement>&{type?:'single'|'multiple';value?:string|string[];defaultValue?:string|string[];onValueChange?:(v:string|string[])=>void;collapsible?:boolean}){
  const init=new Set<string>(defaultValue?(Array.isArray(defaultValue)?defaultValue:[defaultValue]):[])
  const [expanded,setExpanded]=React.useState<Set<string>>(init)
  const toggle=(v:string)=>setExpanded(prev=>{const next=new Set(prev);if(next.has(v)){if(collapsible||type==='multiple')next.delete(v)}else{if(type==='single')next.clear();next.add(v)};return next})
  return <AccCtx.Provider value={{expanded,toggle}}><div className={cn('',className)} {...p}>{children}</div></AccCtx.Provider>
}
function AccordionItem({className,value='',...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string}){return <ItemCtx.Provider value={value}><div className={cn('border-b',className)} {...p}/></ItemCtx.Provider>}
function AccordionTrigger({className,children,...p}:React.HTMLAttributes<HTMLButtonElement>){
  const value=React.useContext(ItemCtx);const {expanded,toggle}=React.useContext(AccCtx);const isOpen=expanded.has(value)
  return <button type="button" onClick={()=>toggle(value)} className={cn('flex w-full items-center justify-between py-4 text-sm font-medium transition-all hover:underline',className)} {...p as React.ButtonHTMLAttributes<HTMLButtonElement>}>
    {children}<span style={{display:'inline-block',transition:'transform 0.2s',transform:isOpen?'rotate(180deg)':'none'}}>▼</span>
  </button>
}
function AccordionContent({className,children,...p}:React.HTMLAttributes<HTMLDivElement>){
  const value=React.useContext(ItemCtx);const {expanded}=React.useContext(AccCtx)
  if(!expanded.has(value))return null
  return <div className={cn('overflow-hidden text-sm pb-4',className)} {...p}>{children}</div>
}
export {Accordion,AccordionItem,AccordionTrigger,AccordionContent}
`,
    'src/components/ui/table.tsx': `import * as React from 'react'
import {cn} from '@/lib/utils'
const Table=React.forwardRef<HTMLTableElement,React.HTMLAttributes<HTMLTableElement>>(({className,...p},r)=><div className="relative w-full overflow-auto"><table ref={r} className={cn('w-full caption-bottom text-sm',className)} {...p}/></div>)
Table.displayName='Table'
const TableHeader=React.forwardRef<HTMLTableSectionElement,React.HTMLAttributes<HTMLTableSectionElement>>(({className,...p},r)=><thead ref={r} className={cn('[&_tr]:border-b',className)} {...p}/>)
TableHeader.displayName='TableHeader'
const TableBody=React.forwardRef<HTMLTableSectionElement,React.HTMLAttributes<HTMLTableSectionElement>>(({className,...p},r)=><tbody ref={r} className={cn('[&_tr:last-child]:border-0',className)} {...p}/>)
TableBody.displayName='TableBody'
const TableFooter=React.forwardRef<HTMLTableSectionElement,React.HTMLAttributes<HTMLTableSectionElement>>(({className,...p},r)=><tfoot ref={r} className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',className)} {...p}/>)
TableFooter.displayName='TableFooter'
const TableRow=React.forwardRef<HTMLTableRowElement,React.HTMLAttributes<HTMLTableRowElement>>(({className,...p},r)=><tr ref={r} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',className)} {...p}/>)
TableRow.displayName='TableRow'
const TableHead=React.forwardRef<HTMLTableCellElement,React.ThHTMLAttributes<HTMLTableCellElement>>(({className,...p},r)=><th ref={r} className={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground',className)} {...p}/>)
TableHead.displayName='TableHead'
const TableCell=React.forwardRef<HTMLTableCellElement,React.TdHTMLAttributes<HTMLTableCellElement>>(({className,...p},r)=><td ref={r} className={cn('p-2 align-middle',className)} {...p}/>)
TableCell.displayName='TableCell'
const TableCaption=React.forwardRef<HTMLTableCaptionElement,React.HTMLAttributes<HTMLTableCaptionElement>>(({className,...p},r)=><caption ref={r} className={cn('mt-4 text-sm text-muted-foreground',className)} {...p}/>)
TableCaption.displayName='TableCaption'
export {Table,TableHeader,TableBody,TableFooter,TableHead,TableRow,TableCell,TableCaption}
`,
    'src/components/ui/radio-group.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Ctx=React.createContext<{v:string;set:(s:string)=>void}>({v:'',set:()=>{}})
function RadioGroup({className,value,defaultValue,onValueChange,...p}:React.HTMLAttributes<HTMLDivElement>&{value?:string;defaultValue?:string;onValueChange?:(v:string)=>void}){
  const [v,setV]=React.useState(value??defaultValue??'')
  React.useEffect(()=>{if(value!==undefined)setV(value)},[value])
  const handle=(nv:string)=>{setV(nv);onValueChange?.(nv)}
  return <Ctx.Provider value={{v,set:handle}}><div role="radiogroup" className={cn('grid gap-2',className)} {...p}/></Ctx.Provider>
}
function RadioGroupItem({className,value='',...p}:Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'>&{value?:string}){
  const {v,set}=React.useContext(Ctx)
  return <input type="radio" value={value} checked={v===value} onChange={()=>set(value)} className={cn('h-4 w-4 rounded-full border border-primary text-primary',className)} {...p}/>
}
export {RadioGroup,RadioGroupItem}
`,
    'src/components/ui/toast.tsx': `'use client'
import * as React from 'react'
import {cn} from '@/lib/utils'
const Toast=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>&{variant?:'default'|'destructive'}>(({className,variant='default',...p},r)=>(
  <div ref={r} className={cn('group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 shadow-lg',variant==='destructive'&&'border-destructive bg-destructive text-destructive-foreground',className)} {...p}/>
))
Toast.displayName='Toast'
const ToastTitle=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLHeadingElement>>(({className,...p},r)=><div ref={r} className={cn('text-sm font-semibold',className)} {...p}/>)
ToastTitle.displayName='ToastTitle'
const ToastDescription=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLParagraphElement>>(({className,...p},r)=><div ref={r} className={cn('text-sm opacity-90',className)} {...p}/>)
ToastDescription.displayName='ToastDescription'
const ToastAction=React.forwardRef<HTMLButtonElement,React.ButtonHTMLAttributes<HTMLButtonElement>>(({className,...p},r)=><button ref={r} className={cn('inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm',className)} {...p}/>)
ToastAction.displayName='ToastAction'
const ToastClose=React.forwardRef<HTMLButtonElement,React.ButtonHTMLAttributes<HTMLButtonElement>>(({className,...p},r)=><button ref={r} className={cn('absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100',className)} {...p}>✕</button>)
ToastClose.displayName='ToastClose'
function ToastProvider({children}:{children?:React.ReactNode}){return <>{children}</>}
function ToastViewport({className,...p}:React.HTMLAttributes<HTMLOListElement>){return <ol className={cn('fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',className)} {...p}/>}
export {ToastProvider,ToastViewport,Toast,ToastTitle,ToastDescription,ToastClose,ToastAction}
export function useToast(){return {toast:()=>{},toasts:[],dismiss:()=>{}}}
`,
    'components/theme-provider.tsx': `'use client'
import * as React from 'react'
interface ThemeProviderProps{children:React.ReactNode;attribute?:string;defaultTheme?:string;enableSystem?:boolean;disableTransitionOnChange?:boolean;storageKey?:string}
export function ThemeProvider({children,defaultTheme='dark',attribute='class'}:ThemeProviderProps){
  React.useEffect(()=>{if(attribute==='class')document.documentElement.classList.add(defaultTheme)},[defaultTheme,attribute])
  return <>{children}</>
}
`,
  }

  // Inject stubs — always overwrite components/ui/* (LLM-generated ones may be broken)
  for (const [stubPath, stubContent] of Object.entries(STUBS)) {
    const isUiComponent = stubPath.includes('components/ui/')
    if (isUiComponent) {
      patched[stubPath] = stubContent // always overwrite with known-good implementation
    } else if (!patched[stubPath]) {
      const importAlias = '@/' + stubPath.replace(/\.(tsx|ts|jsx|js)$/, '')
      if (allContent.includes(importAlias)) {
        patched[stubPath] = stubContent
      }
    }
  }

  return patched
}

function buildFileTree(flatFiles: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree: Record<string, any> = {}
  for (const [filePath, content] of Object.entries(flatFiles)) {
    const parts = filePath.split('/')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: Record<string, any> = tree
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]]) node[parts[i]] = { directory: {} }
      node = node[parts[i]].directory
    }
    node[parts[parts.length - 1]] = { file: { contents: content } }
  }
  return tree
}

// Check if package.json dependencies changed (the only reason to reinstall)
function depsChanged(newPkgJson: string): boolean {
  if (!getLastPkgJson() || !getHasNodeModules()) return true

  try {
    const oldPkg = JSON.parse(getLastPkgJson()!)
    const newPkg = JSON.parse(newPkgJson)

    const oldDeps = JSON.stringify(oldPkg.dependencies ?? {})
    const newDeps = JSON.stringify(newPkg.dependencies ?? {})
    const oldDevDeps = JSON.stringify(oldPkg.devDependencies ?? {})
    const newDevDeps = JSON.stringify(newPkg.devDependencies ?? {})

    return oldDeps !== newDeps || oldDevDeps !== newDevDeps
  } catch {
    return true // if parsing fails, reinstall to be safe
  }
}

// Extract a relative file path from one or more error/log strings.
// Handles 3 common formats from Next.js/webpack output.
function extractErrorFilePath(sources: string[]): string | null {
  const full = sources.join('\n')
  // Format 1: "./components/Foo.tsx" (Next.js compiler, relative path)
  const m1 = full.match(/\.\/([a-zA-Z][\w/.-]+\.(tsx|ts|css|js))/)
  if (m1) return m1[1]
  // Format 2: "components/Foo.tsx:16:3" (file:line:col, no leading ./)
  const m2 = full.match(/\b([a-zA-Z][\w/.-]+\.(tsx|ts|css)):\d+/)
  if (m2) return m2[1]
  // Format 3: Turbopack absolute path ",-[/home/abc123/components/Foo.tsx:6:1]"
  // Extract the project-relative portion after the WebContainer home path
  const m3 = full.match(/\/-\d+tnf\/([\w/.-]+\.(tsx|ts|css|js))/)
  if (m3) return m3[1]
  // Format 4: any absolute path ending in a known extension + line col
  const m4 = full.match(/\/([a-zA-Z][\w/.-]+\.(tsx|ts|css|js))(?::\d+)?/)
  if (m4) return m4[1]
  // Format 5: "Can't resolve './lib/data'" — map to tsx/ts
  const m5 = full.match(/resolve ['"]\.\/([^'"]+)['"]/)
  if (m5) {
    const p = m5[1]
    return (p.endsWith('.tsx') || p.endsWith('.ts') || p.endsWith('.css')) ? p : p + '.tsx'
  }
  return null
}

// Fire-and-forget Supabase save so fixes persist across reloads
function autoSaveFixed(projectId: string, allFiles: Record<string, string>) {
  fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generated_files: allFiles }),
  }).catch(() => {})
}

// Generate a safe, compilable React stub for a broken .tsx/.ts file.
// Uses inline styles only (no Tailwind) so it never has its own CSS compile issues.
function makeComponentStub(filePath: string): string {
  const base = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'Component'
  const name = base.charAt(0).toUpperCase() + base.slice(1).replace(/[-_](.)/g, (_: string, c: string) => c.toUpperCase())
  return [
    "'use client'",
    '',
    '// Auto-stubbed by BuilderAI — original file had a syntax error.',
    '// Click "Auto-fix" in the error overlay to restore the real component.',
    `export default function ${name}() {`,
    '  return (',
    '    <div style={{ padding: "24px", border: "1px dashed #6366f1", borderRadius: "8px",',
    '                  color: "#6366f1", fontSize: "14px", textAlign: "center" as const }}>',
    `      <div style={{ fontWeight: 600, marginBottom: "4px" }}>${name}</div>`,
    '      <div style={{ opacity: 0.7, fontSize: "12px" }}>Click Auto-fix to restore</div>',
    '    </div>',
    '  )',
    '}',
  ].join('\n')
}

export function WebContainerPreview({ files, projectName, projectId, onWriteFileReady, onRuntimeErrorsChange }: WebContainerPreviewProps) {
  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [logs, setLogs] = useState<string[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [runtimeErrors, setRuntimeErrors] = useState<string[]>([])
  const [showErrorOverlay, setShowErrorOverlay] = useState(true)
  const [fixingError, setFixingError] = useState(false)
  const [fixingErrorFile, setFixingErrorFile] = useState('')
  const [showFixInput, setShowFixInput] = useState(false)
  const [fixInputValue, setFixInputValue] = useState('')
  const runFixForPathRef = useRef<((path: string) => void) | null>(null)

  // Surface runtime errors to parent (e.g. for the Code tab Fix button)
  useEffect(() => {
    onRuntimeErrorsChange?.(runtimeErrors)
  }, [runtimeErrors, onRuntimeErrorsChange])

  const statusRef = useRef<Status>({ phase: 'idle' })
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastGoodUrlRef = useRef<string | null>(null)  // persists last working preview URL
  const logsEndRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)
  const devProcessRef = useRef<import('@webcontainer/api').WebContainerProcess | null>(null)
  // Track active output stream abort controllers so we can cancel them on cleanup
  const outputAbortRefs = useRef<AbortController[]>([])
  // Track server-ready teardown so we don't pile up listeners
  const serverReadyCleanupRef = useRef<(() => void) | null>(null)
  // Buffer for incomplete lines (npm sends chunks, not full lines)
  const logBuffer = useRef('')
  // Track timing
  const startTimeRef = useRef(0)
  // Stable ref for files — avoids infinite loops in useCallback/useEffect
  // localFixesRef holds files patched by the auto-fix agent so they survive re-renders
  // (filesRef.current = files on every render would otherwise wipe them out)
  const localFixesRef = useRef<Record<string, string>>({})
  const filesRef = useRef(files)
  filesRef.current = { ...files, ...localFixesRef.current }
  // Component mounted flag — prevents state updates after unmount
  const mountedRef = useRef(true)
  // Mirror of logs state as a ref — enables synchronous scanning without closure staleness
  const logsRef = useRef<string[]>([])
  // Guard: only auto-stub one file per boot cycle to avoid infinite stub→error loops
  const bootStubAppliedRef = useRef(false)
  // Auto-fix attempt tracker: filePath → number of attempts (max 2 per file)
  const autoFixAttemptsRef = useRef<Record<string, number>>({})
  // Debounce timer for auto-fix so we don't fire on every log line
  const autoFixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wrapper to keep statusRef in sync with status state
  const updateStatus = useCallback((s: Status) => {
    statusRef.current = s
    setStatus(s)
  }, [])

  // Surgical fix: send only the broken file + error to the fix agent, hot-patch WebContainer fs
  const handleFixError = useCallback(async () => {
    if (fixingError || runtimeErrors.length === 0) return
    const filePath = extractErrorFilePath(runtimeErrors) ?? extractErrorFilePath(logsRef.current)
    if (!filePath) {
      setShowFixInput(true)
      setFixInputValue('')
      return
    }
    runFixForPathRef.current?.(filePath)
  }, [fixingError, runtimeErrors])

  // Error patterns to detect runtime/compile errors from dev server output
  const ERROR_PATTERNS = [
    /Error:/i, /Unhandled/i, /ENOENT/, /Module not found/i,
    /Cannot find module/i, /SyntaxError/i, /TypeError/i, /ReferenceError/i,
    /Failed to compile/i, /Build error/i, /Compilation failed/i,
    /Unexpected token/i, /is not defined/i, /Cannot read propert/i,
  ]

  const flushLog = (text: string) => {
    const clean = cleanLine(text)
    // Skip pure spinner chars and empty lines
    if (!clean || /^[|/\-\\]+$/.test(clean)) return
    logsRef.current = [...logsRef.current.slice(-300), clean]
    setLogs(prev => [...prev.slice(-300), clean])

    // Detect compile/runtime errors during 'starting' or 'ready' phase.
    // Errors logged during 'starting' (before server-ready) are pre-populated into
    // runtimeErrors so the overlay appears immediately once phase flips to 'ready'.
    const phase = statusRef.current.phase
    if (phase === 'ready' || phase === 'starting') {
      const isError = ERROR_PATTERNS.some(p => p.test(clean))
      if (isError) {
        setRuntimeErrors(prev => [...prev.slice(-20), clean])
        setShowErrorOverlay(true)

        // Auto-fix: when a compile error is detected during 'ready' phase,
        // schedule an auto-fix via the /fix endpoint (debounced, max 2 attempts per file).
        // Next.js with Turbopack fires server-ready BEFORE compiling pages, so compile
        // errors arrive as log lines during 'ready' phase — not before server-ready.
        if (phase === 'ready') {
          const compileErr = /Failed to compile|Unexpected token|SyntaxError|Module not found|Cannot find module/i.test(clean)
          if (compileErr) {
            scheduleAutoFix()
          }
        }
      }
    }
  }

  const addLog = (raw: string) => {
    // Accumulate into buffer, flush complete lines
    logBuffer.current += raw
    const parts = logBuffer.current.split('\n')
    // All but the last part are complete lines
    for (let i = 0; i < parts.length - 1; i++) {
      flushLog(parts[i])
    }
    // Keep the incomplete last chunk in buffer
    logBuffer.current = parts[parts.length - 1]
  }

  const flushBuffer = () => {
    if (logBuffer.current.trim()) {
      flushLog(logBuffer.current)
      logBuffer.current = ''
    }
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  // Listen for error reports from the iframe via postMessage
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === '__BUILDERAI_ERROR__') {
        const err = event.data.error
        const errorLine = `[Runtime] ${err.message || 'Unknown error'}`
        setRuntimeErrors(prev => [...prev.slice(-20), errorLine])
        setShowErrorOverlay(true)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // ── CLEANUP on unmount — kill dev process, abort streams, remove listeners ──
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Kill dev process so it doesn't keep running inside the container
      if (devProcessRef.current) {
        try { devProcessRef.current.kill() } catch { /* ignore */ }
        devProcessRef.current = null
      }
      // Abort any active output stream readers
      for (const ctrl of outputAbortRefs.current) {
        try { ctrl.abort() } catch { /* ignore */ }
      }
      outputAbortRefs.current = []
      // Remove server-ready listener
      if (serverReadyCleanupRef.current) {
        serverReadyCleanupRef.current()
        serverReadyCleanupRef.current = null
      }
      // Reset started flag so next mount can start fresh
      startedRef.current = false
      // Clear auto-fix timer
      if (autoFixTimerRef.current) { clearTimeout(autoFixTimerRef.current); autoFixTimerRef.current = null }
    }
  }, [])

  const startPreview = useCallback(async () => {
    if (startedRef.current) return
    startedRef.current = true
    startTimeRef.current = Date.now()
    setLogs([])
    updateStatus({ phase: 'booting' })

    // Read files from ref — stable reference, no dependency needed
    const currentFiles = filesRef.current

    try {
      const { WebContainer } = await import('@webcontainer/api')

      if (!getWc() && !isBooting()) {
        setBooting(true)
        addLog('⚡ Booting WebContainer…')
        try {
          const instance = await WebContainer.boot()
          setWc(instance)
        } catch (bootErr) {
          // If already booted (e.g. HMR reset the variable), try to recover
          if (String(bootErr).includes('Only a single WebContainer')) {
            addLog('⚠ WebContainer already booted — recovering…')
            // Can't get old instance; must reload page
            setBooting(false)
            throw new Error('WebContainer session expired. Please reload the page (Ctrl+R) to restart.')
          }
          throw bootErr
        }
        setBooting(false)
        addLog('✓ WebContainer ready')
      } else if (isBooting()) {
        addLog('⏳ Waiting for WebContainer to boot…')
        await new Promise<void>(resolve => {
          const check = setInterval(() => {
            if (!isBooting()) { clearInterval(check); resolve() }
          }, 200)
        })
      } else {
        addLog('✓ Reusing existing WebContainer')
      }

      const wc = getWc()!

      // Kill any existing dev server + abort old output streams before starting a new one
      if (devProcessRef.current) {
        try { devProcessRef.current.kill() } catch { /* ignore */ }
        devProcessRef.current = null
        addLog('⏹ Stopped previous dev server')
      }
      // Abort any lingering output stream readers from previous runs
      for (const ctrl of outputAbortRefs.current) {
        try { ctrl.abort() } catch { /* ignore */ }
      }
      outputAbortRefs.current = []
      // Remove old server-ready listener before adding a new one
      if (serverReadyCleanupRef.current) {
        serverReadyCleanupRef.current()
        serverReadyCleanupRef.current = null
      }

      // Patch files: inject shadcn stubs first so patchPackageJson picks up their deps
      addLog('📁 Preparing project files…')
      let patchedFiles = injectShadcnComponents(currentFiles)
      patchedFiles = patchPackageJson(patchedFiles)
      patchedFiles = mockSupabaseClient(patchedFiles)
      patchedFiles = stubTruncatedFiles(patchedFiles)   // must run before fixCommonIssues to detect NL text in original file
      const isLegacyNextJs = currentFiles['package.json']?.includes('"next"') ||
                              Object.keys(currentFiles).some(k => k.startsWith('app/'))
      patchedFiles = fixCommonIssues(patchedFiles)
      patchedFiles = patchAccentColors(patchedFiles)
      patchedFiles = fixImageLoading(patchedFiles)
      patchedFiles = forceViteConfig(patchedFiles)
      patchedFiles = injectErrorBoundary(patchedFiles)

      const currentPkgJson = patchedFiles['package.json'] ?? '{}'
      const needsInstall = depsChanged(currentPkgJson)

      // Mount files
      const tree = buildFileTree(patchedFiles)
      await wc.mount(tree)
      addLog(`✓ Mounted ${Object.keys(patchedFiles).length} files`)

      // npm install — SKIP if deps haven't changed
      if (needsInstall) {
        updateStatus({ phase: 'installing' })
        if (getHasNodeModules()) {
          addLog('📦 Dependencies changed — reinstalling…')
        } else {
          addLog('📦 Installing dependencies (first run takes ~30-60s)…')
        }

        const installProcess = await wc.spawn('npm', [
          'install', '--prefer-offline', '--legacy-peer-deps', '--no-progress', '--loglevel=error'
        ])
        const installAbort = new AbortController()
        outputAbortRefs.current.push(installAbort)
        installProcess.output.pipeTo(
          new WritableStream({ write(data) { addLog(data) } }),
          { signal: installAbort.signal }
        ).catch(() => {}) // ignore abort errors
        const installExit = await installProcess.exit
        // Clean up install stream controller after it finishes
        try { installAbort.abort() } catch { /* ignore */ }
        flushBuffer()
        if (installExit !== 0) throw new Error(`npm install failed (exit ${installExit})`)

        // Cache the installed package.json
        setLastPkgJson(currentPkgJson)
        setHasNodeModules(true)
        addLog('✓ Dependencies installed!')
      } else {
        addLog('⚡ Dependencies unchanged — skipping install (cached)')
      }

      // npm run dev
      updateStatus({ phase: 'starting' })
      addLog('🚀 Starting dev server…')
      const devProcess = await wc.spawn('npm', ['run', 'dev'])
      devProcessRef.current = devProcess
      const devAbort = new AbortController()
      outputAbortRefs.current.push(devAbort)
      devProcess.output.pipeTo(
        new WritableStream({ write(data) { if (mountedRef.current) addLog(data) } }),
        { signal: devAbort.signal }
      ).catch(() => {}) // ignore abort errors

      // Wait for server-ready with timeout
      let serverReadyFired = false
      const onServerReady = (_port: number, url: string) => {
        serverReadyFired = true
        if (!mountedRef.current) return // component unmounted, skip UI update
        const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1)
        addLog(`✓ App running at ${url} (${elapsed}s)`)
        lastGoodUrlRef.current = url  // persist so error state can show previous preview
        updateStatus({ phase: 'ready', url })
        // Synchronously scan all boot-time logs for compile errors so the
        // Auto-fix overlay appears immediately (before any further renders).
        const bootErrorLines = logsRef.current.filter(l =>
          /Failed to compile|Unexpected token|SyntaxError|Module not found|Cannot find module/i.test(l)
        )
        if (bootErrorLines.length > 0) {
          setRuntimeErrors(bootErrorLines.slice(-20))
          setShowErrorOverlay(true)

          // Auto-fix: schedule LLM-powered fix for boot errors (replaces stub approach).
          // The fix endpoint rewrites the broken file properly instead of just stubbing it.
          scheduleAutoFix()
        }
        if (iframeRef.current) iframeRef.current.src = url
        toast.success('Preview ready!', {
          description: `App loaded in ${elapsed}s`,
        })
        // Expose writeFile so the code editor can sync edits into the running container
        onWriteFileReady?.(async (path: string, content: string) => {
          const wc = getWc()
          if (!wc) return
          await wc.fs.writeFile(path, content)
        })
      }
      const unsubServerReady = wc.on('server-ready', onServerReady)
      // Store the unsubscribe function to remove this specific listener later
      serverReadyCleanupRef.current = unsubServerReady

      // Timeout: if server-ready doesn't fire within 120s, show error with logs
      const timeoutId = setTimeout(() => {
        if (!serverReadyFired && statusRef.current.phase === 'starting' && mountedRef.current) {
          addLog('⚠ Dev server did not become ready within 120s')
          addLog('💡 This usually means the generated code has compilation errors.')
          addLog('💡 Check the logs above for errors. Try downloading the code and fixing manually.')
          updateStatus({ phase: 'error', message: 'Dev server timed out — likely compilation errors in generated code. Check logs for details.' })
          startedRef.current = false
          toast.error('Preview timed out', { description: 'The generated code may have errors preventing compilation.' })
        }
      }, 120000)
      // Clear timeout if component unmounts
      if (!mountedRef.current) clearTimeout(timeoutId)

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`✗ ${msg}`)
      updateStatus({ phase: 'error', message: msg })
      startedRef.current = false
      toast.error('Preview failed', { description: msg })
    }
  }, []) // No deps — reads files from filesRef

  // Guard ref for auto-start — ensures it only fires once
  const autoStartedRef = useRef(false)

  const doRestart = useCallback((full: boolean) => {
    // Kill dev process
    if (devProcessRef.current) {
      try { devProcessRef.current.kill() } catch { /* ignore */ }
      devProcessRef.current = null
    }
    // Abort all active output streams to release memory
    for (const ctrl of outputAbortRefs.current) {
      try { ctrl.abort() } catch { /* ignore */ }
    }
    outputAbortRefs.current = []
    // Remove server-ready listener to prevent duplicate handlers
    if (serverReadyCleanupRef.current) {
      serverReadyCleanupRef.current()
      serverReadyCleanupRef.current = null
    }
    if (full) {
      setWc(null)
      setBooting(false)
      setLastPkgJson(null)
      setHasNodeModules(false)
      localFixesRef.current = {} // full restart: clear local fixes (fresh install)
    }
    startedRef.current = false
    autoStartedRef.current = false // allow auto-start to fire again
    bootStubAppliedRef.current = false
    autoFixAttemptsRef.current = {} // reset auto-fix attempts on restart
    if (autoFixTimerRef.current) { clearTimeout(autoFixTimerRef.current); autoFixTimerRef.current = null }
    logsRef.current = []
    setLogs([])
    setRuntimeErrors([])
    setShowErrorOverlay(true)
    updateStatus({ phase: 'idle' })
  }, [updateStatus])

  // Core fix logic — call with a known file path
  const runFixForPath = useCallback(async (filePath: string) => {
    const fileContent = filesRef.current[filePath]
    if (!fileContent) {
      toast.error(`File not in project: ${filePath}`)
      return
    }
    const importRe = /from ['"]\.\.?\/([\w/.-]+)['"]/g
    const related: Record<string, string> = {}
    let m: RegExpExecArray | null
    while ((m = importRe.exec(fileContent)) !== null && Object.keys(related).length < 3) {
      for (const ext of ['', '.ts', '.tsx']) {
        const k = m[1] + ext
        if (filesRef.current[k]) { related[k] = filesRef.current[k]; break }
      }
    }
    const errorContext = logsRef.current.slice(-40).join('\n')
    const { llmMode, apiModel } = useSettingsStore.getState()
    setFixingErrorFile(filePath.split('/').pop() ?? filePath)
    setFixingError(true)
    setShowFixInput(false)
    try {
      const res = await fetch('/api/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          file_content: fileContent,
          error_message: errorContext,
          related_files: related,
          llm_mode: llmMode,
          llm_model: llmMode === 'api' ? apiModel : null,
        }),
      })
      const data = await res.json()
      if (data.success && data.fixed_content) {
        // Store in localFixesRef so the fix survives re-renders
        // (filesRef.current = files on every render would otherwise wipe it out)
        localFixesRef.current = { ...localFixesRef.current, [filePath]: data.fixed_content }
        const updatedFiles = { ...filesRef.current, [filePath]: data.fixed_content }
        filesRef.current = updatedFiles
        if (projectId) autoSaveFixed(projectId, updatedFiles)
        toast.success(`Fixed ${filePath.split('/').pop()} — rebuilding…`)
        doRestart(false)
      } else {
        toast.error('Fix failed: ' + (data.error ?? 'unknown'))
      }
    } catch {
      toast.error('Fix request failed')
    } finally {
      setFixingError(false)
      setFixingErrorFile('')
    }
  }, [projectId, doRestart])
  // Keep a stable ref so handleFixError (defined earlier) can call runFixForPath without ordering issues
  runFixForPathRef.current = runFixForPath

  // Fix for phase === 'error' or 'ready' with compile errors: reads build logs to find the broken file
  const handleFixFromLogs = useCallback(async () => {
    if (fixingError) return

    // Use logsRef (always current) with logs state as fallback
    const filePath = extractErrorFilePath(logsRef.current) ?? extractErrorFilePath(logs)
    if (!filePath) {
      // Can't auto-detect — show manual input so user can type the file path
      setShowFixInput(true)
      setFixInputValue('')
      return
    }
    await runFixForPath(filePath)
  }, [fixingError, logs, runFixForPath])

  // ── Auto-fix: automatically attempt to fix compile errors without user intervention ──
  // Triggers when errors are detected, up to 2 attempts per broken file path.
  // After 2 failed attempts, falls back to showing the manual "Fix Error" button.
  const triggerAutoFix = useCallback(() => {
    // Don't auto-fix if already fixing or not in ready/error phase
    if (fixingError) return
    const phase = statusRef.current.phase
    if (phase !== 'ready' && phase !== 'error') return

    // Find the broken file
    const allErrors = [...logsRef.current.slice(-40)]
    const filePath = extractErrorFilePath(allErrors)
    if (!filePath) return // Can't identify broken file — user will see manual button

    // Check attempt count — max 2 auto-fix attempts per file
    const attempts = autoFixAttemptsRef.current[filePath] ?? 0
    if (attempts >= 2) return // Exhausted auto-fix attempts, manual button is visible

    // Increment attempt count
    autoFixAttemptsRef.current[filePath] = attempts + 1
    addLog(`🔧 Auto-fixing ${filePath.split('/').pop()} (attempt ${attempts + 1}/2)…`)
    runFixForPathRef.current?.(filePath)
  }, [fixingError])

  // Debounced auto-fix trigger — called from flushLog when compile errors are detected.
  // Uses a 1.5s debounce so Next.js has time to log the full error + file path.
  const scheduleAutoFix = useCallback(() => {
    if (autoFixTimerRef.current) clearTimeout(autoFixTimerRef.current)
    autoFixTimerRef.current = setTimeout(() => {
      autoFixTimerRef.current = null
      triggerAutoFix()
    }, 1500) // 1.5s gives Next.js time to log the file path after the error
  }, [triggerAutoFix])

  // Hot-reload: when files change and we already have a running container,
  // just remount the source files — Next.js HMR handles the rest
  const hotReload = useCallback(async () => {
    if (!getWc() || !getHasNodeModules()) return

    const currentFiles = filesRef.current
    const wc = getWc()!
    let patchedFiles = injectShadcnComponents(currentFiles)
    patchedFiles = patchPackageJson(patchedFiles)
    patchedFiles = mockSupabaseClient(patchedFiles)
    patchedFiles = stubTruncatedFiles(patchedFiles)   // must run before fixCommonIssues
    const isLegacyNextJsHR = currentFiles['package.json']?.includes('"next"') ||
                              Object.keys(currentFiles).some(k => k.startsWith('app/'))
    patchedFiles = fixCommonIssues(patchedFiles)
    patchedFiles = fixImageLoading(patchedFiles)
    patchedFiles = isLegacyNextJsHR ? forceLegacyNextConfig(patchedFiles) : forceViteConfig(patchedFiles)
    patchedFiles = injectErrorBoundary(patchedFiles)

    const currentPkgJson = patchedFiles['package.json'] ?? '{}'
    const needsInstall = depsChanged(currentPkgJson)

    if (needsInstall) {
      // New deps needed — restart (auto-start will re-trigger)
      doRestart(false)
      return
    }

    // Only remount source files (not node_modules) — Next.js HMR picks up changes
    addLog('🔄 Hot-reloading source files…')
    const tree = buildFileTree(patchedFiles)
    await wc.mount(tree)
    addLog(`✓ Updated ${Object.keys(patchedFiles).length} files`)
    toast.info('Files updated', { description: 'Preview will refresh automatically via HMR' })
  }, [doRestart]) // doRestart is stable (no deps)

  // Auto-start preview when files are available and we're idle
  useEffect(() => {
    if (status.phase === 'idle' && Object.keys(files).length > 0 && files['package.json'] && !autoStartedRef.current) {
      autoStartedRef.current = true
      // Small delay to avoid firing on every intermediate render
      const timer = setTimeout(() => {
        startPreview()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [files, status.phase, startPreview])

  // When files change while preview is already running, hot-reload
  const prevFilesRef = useRef<Record<string, string>>({})
  useEffect(() => {
    const prevFiles = prevFilesRef.current
    const hasChanged = Object.keys(files).length !== Object.keys(prevFiles).length ||
      Object.entries(files).some(([k, v]) => prevFiles[k] !== v)

    if (hasChanged && status.phase === 'ready' && Object.keys(prevFiles).length > 0) {
      hotReload()
    }
    prevFilesRef.current = files
  }, [files, status.phase, hotReload])

  const isLoading = ['booting', 'installing', 'starting'].includes(status.phase)

  const phaseLabel: Record<string, string> = {
    booting:    '⚡ Booting sandbox…',
    installing: '📦 Installing dependencies…',
    starting:   '🚀 Starting dev server…',
  }

  const fullscreenClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-background'
    : 'flex flex-col h-full'

  return (
    <div className={fullscreenClasses}>
      {/* Fullscreen: dark overlay behind */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-black/60 -z-10" onClick={() => setIsFullscreen(false)} />
      )}

      {/* ── IDLE ── */}
      {status.phase === 'idle' && (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="text-5xl">🚀</div>
          <h3 className="text-lg font-semibold">Live Preview</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Runs your app fully in the browser — no local install needed.<br />
            <span className="text-xs opacity-60">
              {getHasNodeModules()
                ? 'Dependencies cached — reload will be fast!'
                : 'First run takes ~60s to install dependencies.'}
            </span>
          </p>
          <Button onClick={startPreview} className="gap-2 mt-2">
            <Terminal className="w-4 h-4" />
            {getHasNodeModules() ? 'Run App (Fast)' : 'Run App in Browser'}
          </Button>
        </div>
      )}

      {/* ── LOADING ── */}
      {isLoading && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 text-xs text-muted-foreground shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span>{phaseLabel[status.phase] ?? 'Loading…'}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="w-6 h-6" title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => doRestart(false)}>
                Cancel
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-black p-3 font-mono text-xs overflow-y-auto text-green-300">
            {logs.map((line, i) => (
              <div key={i} className="leading-5 whitespace-pre-wrap break-all">{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ── READY ── */}
      {status.phase === 'ready' && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-card/50 text-xs shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
            <span className="text-muted-foreground truncate flex-1 font-mono">
              {isFullscreen ? (projectName ?? 'App Preview') + ' — Fullscreen' : 'Preview running'}
            </span>
            <Button variant="ghost" size="icon" className="w-6 h-6" title="Reload preview" onClick={() => {
              if (iframeRef.current) iframeRef.current.src = status.url
            }}>
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="w-6 h-6" title="Quick restart (keep deps)" onClick={() => doRestart(false)}>
              <Zap className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="w-6 h-6" title="Full restart (fresh install)" onClick={() => doRestart(true)}>
              <Terminal className="w-3 h-3" />
            </Button>
            <button
              onClick={handleFixFromLogs}
              disabled={fixingError}
              title="Auto-fix compile errors with AI"
              style={{
                background: fixingError ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.35)',
                borderRadius: '4px',
                color: fixingError ? '#818cf8' : '#a5b4fc',
                fontSize: '10px',
                padding: '2px 6px',
                cursor: fixingError ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              {fixingError
                ? <Loader2 size={10} className="animate-spin" />
                : <Wrench size={10} />}
              {fixingError ? (fixingErrorFile ?? 'Fixing…') : 'Fix errors'}
            </button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <Button variant="ghost" size="icon" className="w-6 h-6" title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </Button>
            {isFullscreen && (
              <Button variant="ghost" size="icon" className="w-6 h-6" title="Close fullscreen" onClick={() => setIsFullscreen(false)}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>

          {/* Manual file path input — shown when auto-detect fails */}
          {showFixInput && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-500/30 bg-indigo-950/40 shrink-0">
              <span className="text-xs text-indigo-300 shrink-0">File to fix:</span>
              <input
                autoFocus
                list="project-files-list"
                value={fixInputValue}
                onChange={e => setFixInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && fixInputValue.trim()) runFixForPath(fixInputValue.trim())
                  if (e.key === 'Escape') setShowFixInput(false)
                }}
                placeholder="components/ExperienceTimeline.tsx"
                style={{
                  flex: 1,
                  background: 'rgba(30,27,75,0.6)',
                  border: '1px solid rgba(99,102,241,0.4)',
                  borderRadius: '4px',
                  color: '#e0e7ff',
                  fontSize: '11px',
                  padding: '3px 7px',
                  outline: 'none',
                }}
              />
              <datalist id="project-files-list">
                {Object.keys(filesRef.current)
                  .filter(p => p.endsWith('.tsx') || p.endsWith('.ts'))
                  .map(p => <option key={p} value={p} />)}
              </datalist>
              <button
                onClick={() => { if (fixInputValue.trim()) runFixForPath(fixInputValue.trim()) }}
                disabled={!fixInputValue.trim()}
                style={{
                  background: 'rgba(99,102,241,0.25)',
                  border: '1px solid rgba(99,102,241,0.5)',
                  borderRadius: '4px',
                  color: '#a5b4fc',
                  fontSize: '10px',
                  padding: '3px 8px',
                  cursor: fixInputValue.trim() ? 'pointer' : 'not-allowed',
                  opacity: fixInputValue.trim() ? 1 : 0.5,
                }}
              >Fix</button>
              <button onClick={() => setShowFixInput(false)} style={{ color: '#6b7280', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          )}

          <div className="relative flex-1">
            <iframe
              ref={iframeRef}
              src={status.url}
              className="absolute inset-0 w-full h-full border-0"
              allow="cross-origin-isolated"
              title={projectName ?? 'App Preview'}
            />

            {/* Runtime error overlay — collapsible, on top of iframe */}
            {runtimeErrors.length > 0 && showErrorOverlay && (
              <div className="absolute bottom-0 left-0 right-0 max-h-48 bg-black/90 border-t border-red-500/50 backdrop-blur-sm overflow-y-auto z-10">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-red-500/30">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                    {fixingError
                      ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                      : <AlertTriangle className="w-3 h-3" />}
                    {fixingError
                      ? `Auto-fixing ${fixingErrorFile || 'error'}…`
                      : `${runtimeErrors.length} error${runtimeErrors.length > 1 ? 's' : ''} detected`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleFixError}
                      disabled={fixingError}
                      title="Auto-fix with AI"
                      style={{
                        background: fixingError ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        borderRadius: '4px',
                        color: '#a5b4fc',
                        fontSize: '10px',
                        padding: '2px 7px',
                        cursor: fixingError ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {fixingError
                        ? <Loader2 size={10} className="animate-spin" />
                        : <Wrench size={10} />}
                      {fixingError ? 'Fixing…' : 'Auto-fix'}
                    </button>
                    <Button variant="ghost" size="icon" className="w-5 h-5" title="Clear errors" onClick={() => setRuntimeErrors([])}>
                      <X className="w-3 h-3 text-red-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-5 h-5" title="Minimize" onClick={() => setShowErrorOverlay(false)}>
                      <Minimize2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                <div className="p-2 font-mono text-xs text-red-300 space-y-1">
                  {runtimeErrors.map((err, i) => {
                    const t = translateBuildError(err)
                    if (t) return (
                      <div key={i} style={{ marginBottom: '6px', padding: '6px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: '4px' }}>
                        <div style={{ fontWeight: 600, color: '#f87171' }}>{t.headline}</div>
                        <div style={{ color: '#fca5a5', fontSize: '11px', marginTop: '2px' }}>{t.detail}</div>
                        <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '3px', fontStyle: 'italic' }}>Hint: {t.hint}</div>
                      </div>
                    )
                    return <div key={i} className="whitespace-pre-wrap break-all">{err}</div>
                  })}
                </div>
              </div>
            )}

            {/* Small badge when overlay is dismissed but errors exist */}
            {runtimeErrors.length > 0 && !showErrorOverlay && (
              <button
                className="absolute bottom-2 right-2 z-10 flex items-center gap-1 px-2 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-400 hover:bg-red-500/30 transition-colors"
                onClick={() => setShowErrorOverlay(true)}
              >
                <AlertTriangle className="w-3 h-3" />
                {runtimeErrors.length} error{runtimeErrors.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── ERROR ── */}
      {status.phase === 'error' && (
        <div className="flex flex-col h-full">
          <div className="relative flex-1 overflow-hidden">
            {/* If we have a previous working URL, keep it visible (dimmed) for context */}
            {lastGoodUrlRef.current && (
              <iframe
                src={lastGoodUrlRef.current}
                className="absolute inset-0 w-full h-full border-0 opacity-30"
                allow="cross-origin-isolated"
                title="Previous preview"
              />
            )}
            {/* Error log overlay on top */}
            <div className="absolute inset-0 bg-black/80 p-3 font-mono text-xs overflow-y-auto text-red-400">
              {lastGoodUrlRef.current && (
                <div className="mb-2 px-2 py-1 rounded text-yellow-400 text-xs font-medium" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
                  Showing previous version — new build failed
                </div>
              )}
              {logs.map((line, i) => (
                <div key={i} className="leading-5 whitespace-pre-wrap break-all">{line}</div>
              ))}
            </div>
          </div>
          <div className="p-4 border-t border-border flex items-center gap-3 shrink-0">
            <p className="text-xs text-destructive flex-1 truncate">{status.message}</p>
            <button
              onClick={handleFixFromLogs}
              disabled={fixingError}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-indigo-500/40 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {fixingError ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
              {fixingError && fixingErrorFile ? `Fixing ${fixingErrorFile}…` : fixingError ? 'Fixing…' : 'Auto-fix'}
            </button>
            <Button size="sm" variant="outline" onClick={() => doRestart(false)} className="gap-1.5 text-xs shrink-0">
              <RefreshCw className="w-3 h-3" /> Retry
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
