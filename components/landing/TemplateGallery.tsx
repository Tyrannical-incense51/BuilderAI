'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface Template {
  id: string
  name: string
  category: string
  prompt: string
  previewUrl: string
  preview: React.ReactNode
}

const CATEGORIES = ['All', 'AI Apps', 'Business Apps', 'Websites', 'Personal']

// ── Inline mini-mockup previews ──────────────────────────────────────────────

function AIChatPreview() {
  return (
    <div className="h-full bg-zinc-900 flex">
      {/* Sidebar */}
      <div className="w-16 bg-zinc-800 border-r border-zinc-700 flex flex-col items-center py-3 gap-2">
        {['🤖', '🧠', '✨'].map((e, i) => (
          <div key={i} className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs', i === 0 ? 'bg-purple-500/30 border border-purple-500/50' : 'bg-zinc-700')}>{e}</div>
        ))}
      </div>
      {/* Chat */}
      <div className="flex-1 flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-purple-500 shrink-0" />
          <div className="bg-zinc-700 rounded-lg rounded-tl-none px-2 py-1 text-[9px] text-zinc-300 max-w-[80%]">Hello! How can I help you today?</div>
        </div>
        <div className="flex gap-2 justify-end">
          <div className="bg-purple-600 rounded-lg rounded-tr-none px-2 py-1 text-[9px] text-white max-w-[80%]">Explain quantum computing</div>
        </div>
        <div className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-purple-500 shrink-0" />
          <div className="bg-zinc-700 rounded-lg rounded-tl-none px-2 py-1 text-[9px] text-zinc-300 max-w-[80%]">Quantum computing uses qubits that can exist in superposition...</div>
        </div>
        <div className="mt-auto bg-zinc-800 rounded border border-zinc-600 px-2 py-1 text-[9px] text-zinc-500">Type a message...</div>
      </div>
    </div>
  )
}

function KanbanPreview() {
  const cols = [
    { label: 'To Do', color: 'bg-blue-500', cards: ['Design mockup', 'Setup DB'] },
    { label: 'In Progress', color: 'bg-yellow-500', cards: ['Auth system'] },
    { label: 'Done', color: 'bg-green-500', cards: ['Project init', 'Routing'] },
  ]
  return (
    <div className="h-full bg-zinc-900 flex gap-2 p-3">
      {cols.map((col) => (
        <div key={col.label} className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <div className={cn('w-1.5 h-1.5 rounded-full', col.color)} />
            <span className="text-[8px] font-semibold text-zinc-400">{col.label}</span>
          </div>
          {col.cards.map((card) => (
            <div key={card} className="bg-zinc-800 rounded p-1.5 border border-zinc-700">
              <p className="text-[8px] text-zinc-300">{card}</p>
            </div>
          ))}
          <div className="border border-dashed border-zinc-700 rounded p-1 text-center">
            <span className="text-[8px] text-zinc-600">+ Add</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function EcommercePreview() {
  const products = [
    { name: 'Headphones', price: '$79', color: 'bg-blue-400/20' },
    { name: 'Watch', price: '$129', color: 'bg-purple-400/20' },
    { name: 'Sneakers', price: '$89', color: 'bg-orange-400/20' },
    { name: 'Backpack', price: '$59', color: 'bg-green-400/20' },
  ]
  return (
    <div className="h-full bg-zinc-900 flex flex-col">
      <div className="bg-zinc-800 px-3 py-1.5 flex items-center gap-2 border-b border-zinc-700">
        <span className="text-[9px] font-bold text-white">Shop</span>
        <div className="flex-1" />
        <div className="text-[8px] text-zinc-400">🛒 3</div>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2 p-2">
        {products.map((p) => (
          <div key={p.name} className="bg-zinc-800 rounded border border-zinc-700 flex flex-col overflow-hidden">
            <div className={cn('h-10 flex items-center justify-center text-lg', p.color)}>
              {p.name === 'Headphones' ? '🎧' : p.name === 'Watch' ? '⌚' : p.name === 'Sneakers' ? '👟' : '🎒'}
            </div>
            <div className="px-1.5 py-1">
              <p className="text-[7px] font-medium text-zinc-300 truncate">{p.name}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[7px] font-bold text-green-400">{p.price}</span>
                <span className="text-[6px] bg-primary/80 text-white px-1 py-0.5 rounded">Add</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DashboardPreview() {
  return (
    <div className="h-full bg-zinc-900 flex">
      {/* Sidebar */}
      <div className="w-14 bg-zinc-800 border-r border-zinc-700 flex flex-col gap-2 py-3 px-2">
        {['📊', '📁', '👥', '⚙️'].map((icon, i) => (
          <div key={i} className={cn('w-full py-1.5 rounded text-center text-xs', i === 0 ? 'bg-primary/20 border border-primary/30' : '')}>{icon}</div>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 flex flex-col gap-2 p-2">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-1.5">
          {[{ label: 'Revenue', val: '$12k', color: 'text-green-400' }, { label: 'Users', val: '2.4k', color: 'text-blue-400' }, { label: 'Orders', val: '847', color: 'text-purple-400' }].map((s) => (
            <div key={s.label} className="bg-zinc-800 rounded border border-zinc-700 p-1.5">
              <p className="text-[7px] text-zinc-500">{s.label}</p>
              <p className={cn('text-[10px] font-bold', s.color)}>{s.val}</p>
            </div>
          ))}
        </div>
        {/* Chart placeholder */}
        <div className="flex-1 bg-zinc-800 rounded border border-zinc-700 p-2">
          <p className="text-[7px] text-zinc-500 mb-1">Revenue Chart</p>
          <div className="flex items-end gap-1 h-10">
            {[40, 65, 45, 80, 55, 70, 90].map((h, i) => (
              <div key={i} className="flex-1 bg-primary/40 rounded-sm" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecipePreview() {
  return (
    <div className="h-full bg-zinc-900 flex flex-col gap-2 p-3">
      <p className="text-[9px] font-bold text-white">🍳 Recipe Generator</p>
      <div className="flex flex-wrap gap-1">
        {['🍅 Tomato', '🧄 Garlic', '🫒 Olive Oil', '🌿 Basil'].map((i) => (
          <span key={i} className="text-[7px] bg-orange-500/20 border border-orange-500/30 text-orange-300 px-1.5 py-0.5 rounded-full">{i}</span>
        ))}
        <span className="text-[7px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded-full">+ Add</span>
      </div>
      <button className="bg-orange-500 text-white text-[8px] py-1.5 rounded font-medium">✨ Generate Recipe</button>
      <div className="flex-1 bg-zinc-800 rounded border border-zinc-700 p-2">
        <p className="text-[8px] font-semibold text-white mb-1">Pasta Pomodoro</p>
        <p className="text-[7px] text-zinc-400 leading-relaxed">Cook garlic in olive oil until golden. Add crushed tomatoes, simmer 15 min. Toss with pasta and fresh basil.</p>
      </div>
    </div>
  )
}

function BlogPreview() {
  return (
    <div className="h-full bg-zinc-900 flex flex-col">
      <div className="bg-gradient-to-r from-blue-600/30 to-purple-600/30 p-3 flex-none">
        <p className="text-[9px] font-bold text-white">The Dev Blog</p>
        <p className="text-[7px] text-zinc-400 mt-0.5">Engineering insights & tutorials</p>
      </div>
      <div className="flex-1 flex flex-col gap-1.5 p-2 overflow-hidden">
        {[
          { title: 'Building with LangGraph', tag: 'AI', color: 'text-purple-400 bg-purple-400/10' },
          { title: 'Next.js 14 Deep Dive', tag: 'Web', color: 'text-blue-400 bg-blue-400/10' },
          { title: 'TypeScript Best Practices', tag: 'Dev', color: 'text-green-400 bg-green-400/10' },
        ].map((post) => (
          <div key={post.title} className="bg-zinc-800 rounded border border-zinc-700 p-1.5 flex items-center gap-2">
            <div className="w-8 h-8 bg-zinc-700 rounded shrink-0" />
            <div>
              <p className="text-[8px] font-medium text-zinc-200">{post.title}</p>
              <span className={cn('text-[6px] px-1 py-0.5 rounded', post.color)}>{post.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TaskManagerPreview() {
  const tasks = [
    { label: 'Review PR #42', done: true, priority: 'low' },
    { label: 'Deploy to staging', done: false, priority: 'high' },
    { label: 'Update docs', done: false, priority: 'medium' },
    { label: 'Fix login bug', done: false, priority: 'high' },
  ]
  const priorityColor: Record<string, string> = { high: 'text-red-400 bg-red-400/10', medium: 'text-yellow-400 bg-yellow-400/10', low: 'text-green-400 bg-green-400/10' }
  return (
    <div className="h-full bg-zinc-900 flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold text-white">My Tasks</p>
        <span className="text-[7px] text-zinc-500">3 pending</span>
      </div>
      <div className="flex flex-col gap-1">
        {tasks.map((t) => (
          <div key={t.label} className="flex items-center gap-2 bg-zinc-800 rounded border border-zinc-700 px-2 py-1.5">
            <div className={cn('w-3 h-3 rounded-full border flex items-center justify-center shrink-0', t.done ? 'bg-green-500 border-green-500' : 'border-zinc-600')}>
              {t.done && <span className="text-[6px] text-white">✓</span>}
            </div>
            <span className={cn('flex-1 text-[8px]', t.done ? 'line-through text-zinc-600' : 'text-zinc-300')}>{t.label}</span>
            <span className={cn('text-[6px] px-1 py-0.5 rounded', priorityColor[t.priority])}>{t.priority}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PortfolioPreview() {
  return (
    <div className="h-full bg-zinc-900 flex flex-col">
      <div className="bg-gradient-to-br from-indigo-900/50 to-purple-900/50 p-3 flex-none flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 shrink-0" />
        <div>
          <p className="text-[9px] font-bold text-white">Alex Chen</p>
          <p className="text-[7px] text-zinc-400">Full-Stack Developer</p>
        </div>
      </div>
      <div className="flex-1 p-2 flex flex-col gap-1.5">
        <p className="text-[7px] text-zinc-500 uppercase tracking-wider">Work</p>
        <div className="grid grid-cols-2 gap-1">
          {['E-Commerce App', 'AI Dashboard', 'Chat System', 'Mobile App'].map((p) => (
            <div key={p} className="bg-zinc-800 rounded border border-zinc-700 h-8 flex items-center justify-center">
              <p className="text-[7px] text-zinc-400">{p}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Templates data ───────────────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: 'ai-chat', name: 'AI Chat App', category: 'AI Apps',
    prompt: 'Build an AI chat app with a sidebar showing different AI personas, chat bubbles, and streaming responses',
    previewUrl: 'myapp.vercel.app/chat',
    preview: <AIChatPreview />,
  },
  {
    id: 'kanban', name: 'Kanban Board', category: 'Business Apps',
    prompt: 'Build a Kanban board like Trello with drag and drop, columns (Todo / In Progress / Done), and card creation',
    previewUrl: 'myapp.vercel.app/board',
    preview: <KanbanPreview />,
  },
  {
    id: 'ecommerce', name: 'E-Commerce Store', category: 'Business Apps',
    prompt: 'Build an e-commerce store with product grid, shopping cart, and checkout flow with dark mode',
    previewUrl: 'myapp.vercel.app/shop',
    preview: <EcommercePreview />,
  },
  {
    id: 'dashboard', name: 'SaaS Dashboard', category: 'Business Apps',
    prompt: 'Build a SaaS analytics dashboard with sidebar navigation, stat cards, and a revenue bar chart',
    previewUrl: 'myapp.vercel.app/dashboard',
    preview: <DashboardPreview />,
  },
  {
    id: 'recipe', name: 'Recipe Generator', category: 'AI Apps',
    prompt: 'Build an AI recipe generator where users add ingredients as tags and generate recipes with a single click',
    previewUrl: 'myapp.vercel.app/recipes',
    preview: <RecipePreview />,
  },
  {
    id: 'blog', name: 'Blog Platform', category: 'Websites',
    prompt: 'Build a blog platform with markdown support, article listing, tags, and a clean reading experience',
    previewUrl: 'myapp.vercel.app/blog',
    preview: <BlogPreview />,
  },
  {
    id: 'tasks', name: 'Task Manager', category: 'Personal',
    prompt: 'Build a task manager with priority levels (high/medium/low), checkboxes, due dates, and filtering',
    previewUrl: 'myapp.vercel.app/tasks',
    preview: <TaskManagerPreview />,
  },
  {
    id: 'portfolio', name: 'Portfolio Site', category: 'Websites',
    prompt: 'Build a developer portfolio site with hero section, project grid, skills list, and contact form',
    previewUrl: 'myapp.vercel.app',
    preview: <PortfolioPreview />,
  },
]

// ── Gallery component ────────────────────────────────────────────────────────

interface TemplateGalleryProps {
  onSelect?: (template: Template) => void // called instead of router.push when provided
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState('All')

  const filtered = selectedCategory === 'All'
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === selectedCategory)

  function handleClick(template: Template) {
    if (onSelect) {
      onSelect(template)
    } else {
      router.push(`/signup?prompt=${encodeURIComponent(template.prompt)}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 justify-center">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
              selectedCategory === cat
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((template) => (
          <div
            key={template.id}
            onClick={() => handleClick(template)}
            className="group cursor-pointer rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20"
          >
            {/* Browser chrome */}
            <div className="bg-zinc-800 px-3 py-2 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500/70" />
                <div className="w-2 h-2 rounded-full bg-yellow-500/70" />
                <div className="w-2 h-2 rounded-full bg-green-500/70" />
              </div>
              <div className="flex-1 bg-zinc-700 rounded text-[9px] text-zinc-400 px-2 py-0.5 text-center truncate">
                {template.previewUrl}
              </div>
            </div>

            {/* App preview */}
            <div className="h-40 relative overflow-hidden">
              {template.preview}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
                  Build this →
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-card flex items-center justify-between">
              <span className="font-medium text-sm">{template.name}</span>
              <Badge variant="secondary" className="text-[10px]">{template.category}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
