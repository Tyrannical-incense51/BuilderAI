'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, Sparkles, DollarSign, LayoutDashboard, ShoppingCart, BookOpen, Briefcase, Heart, X } from 'lucide-react'

interface ShowcaseProject {
  name: string
  category: string
  categoryColor: string
  prompt: string
  description: string
  icon: typeof DollarSign
  gradient: string
  mockupElements: React.ReactNode
  expandedMockup: React.ReactNode
}

const showcaseProjects: ShowcaseProject[] = [
  {
    name: 'WealthOS',
    category: 'Finance',
    categoryColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    prompt: 'Build a full-featured personal finance tracker with dashboard showing net worth trend, spending by category charts, transaction list with filters, and budget management — all backed by localStorage with beautiful dark theme and Indian Rupee currency',
    description: 'Personal finance tracker with analytics',
    icon: DollarSign,
    gradient: 'from-emerald-600/20 via-cyan-600/10 to-blue-600/20',
    mockupElements: (
      <div className="space-y-2 p-3">
        <div className="flex gap-2">
          <div className="flex-1 h-8 rounded bg-emerald-500/20 border border-emerald-500/10" />
          <div className="flex-1 h-8 rounded bg-cyan-500/20 border border-cyan-500/10" />
        </div>
        <div className="h-20 rounded bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-border/30 flex items-end p-2 gap-1">
          {[3, 5, 4, 7, 6, 8, 7, 9].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-emerald-500/40" style={{ height: `${h * 8}%` }} />
          ))}
        </div>
        <div className="space-y-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-4 rounded bg-muted/30 flex items-center gap-2 px-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500/40" />
              <div className="flex-1 h-1.5 rounded bg-muted/50" />
            </div>
          ))}
        </div>
      </div>
    ),
    expandedMockup: (
      <div className="p-6 space-y-4 bg-[#0c1015] rounded-xl min-h-[400px]">
        {/* Top stat cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Net Worth', value: '\u20b912,45,000', change: '+4.2%', color: 'emerald' },
            { label: 'Monthly Spend', value: '\u20b934,200', change: '-2.1%', color: 'cyan' },
            { label: 'Savings Rate', value: '42%', change: '+1.5%', color: 'blue' },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="text-[10px] text-gray-400">{s.label}</div>
              <div className="text-lg font-bold text-white mt-0.5">{s.value}</div>
              <div className={`text-[10px] mt-1 ${s.change.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{s.change} this month</div>
            </div>
          ))}
        </div>
        {/* Chart area */}
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <div className="text-xs text-gray-400 mb-3">Net Worth Trend</div>
          <div className="h-32 flex items-end gap-1.5">
            {[30, 35, 32, 40, 45, 42, 50, 55, 52, 60, 65, 70].map((h, i) => (
              <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/60 to-emerald-400/30 transition-all" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[9px] text-gray-500">
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(m => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
        {/* Transactions */}
        <div className="rounded-lg bg-white/5 border border-white/10 p-4">
          <div className="text-xs text-gray-400 mb-3">Recent Transactions</div>
          <div className="space-y-2">
            {[
              { name: 'Grocery Store', amount: '-\u20b92,340', cat: 'Food' },
              { name: 'Salary Credit', amount: '+\u20b985,000', cat: 'Income' },
              { name: 'Netflix', amount: '-\u20b9649', cat: 'Entertainment' },
              { name: 'Electricity Bill', amount: '-\u20b91,200', cat: 'Utilities' },
            ].map(tx => (
              <div key={tx.name} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center">
                    <DollarSign className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs text-white">{tx.name}</div>
                    <div className="text-[9px] text-gray-500">{tx.cat}</div>
                  </div>
                </div>
                <span className={`text-xs font-medium ${tx.amount.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{tx.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    name: 'TaskFlow',
    category: 'Productivity',
    categoryColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    prompt: 'Build a modern Kanban board task manager with drag-and-drop columns (To Do, In Progress, Done), task creation with priority labels, due dates, and assignees — with dark theme, smooth animations, and localStorage persistence',
    description: 'Kanban board with drag & drop',
    icon: LayoutDashboard,
    gradient: 'from-blue-600/20 via-violet-600/10 to-purple-600/20',
    mockupElements: (
      <div className="flex gap-2 p-3 h-full">
        {['To Do', 'In Progress', 'Done'].map((col) => (
          <div key={col} className="flex-1 space-y-1.5">
            <div className="text-[8px] font-semibold text-muted-foreground/60 px-1">{col}</div>
            {Array.from({ length: col === 'In Progress' ? 2 : 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-blue-500/10 border border-blue-500/10 p-1.5">
                <div className="h-1.5 w-3/4 rounded bg-blue-500/20" />
                <div className="h-1 w-1/2 rounded bg-muted/30 mt-1" />
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    expandedMockup: (
      <div className="p-6 bg-[#0c1015] rounded-xl min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-white">TaskFlow Board</div>
          <div className="flex gap-2">
            <div className="px-2 py-1 text-[10px] bg-blue-500/20 text-blue-400 rounded border border-blue-500/20">+ Add Task</div>
            <div className="px-2 py-1 text-[10px] bg-white/5 text-gray-400 rounded border border-white/10">Filter</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 h-[360px]">
          {[
            { title: 'To Do', color: 'blue', tasks: [
              { name: 'Design landing page', priority: 'High', tag: 'text-rose-400 bg-rose-500/10' },
              { name: 'Write API docs', priority: 'Medium', tag: 'text-amber-400 bg-amber-500/10' },
              { name: 'Setup CI/CD', priority: 'Low', tag: 'text-emerald-400 bg-emerald-500/10' },
            ]},
            { title: 'In Progress', color: 'violet', tasks: [
              { name: 'Build auth system', priority: 'High', tag: 'text-rose-400 bg-rose-500/10' },
              { name: 'Database schema', priority: 'Medium', tag: 'text-amber-400 bg-amber-500/10' },
            ]},
            { title: 'Done', color: 'emerald', tasks: [
              { name: 'Project setup', priority: 'Done', tag: 'text-emerald-400 bg-emerald-500/10' },
              { name: 'Git repository', priority: 'Done', tag: 'text-emerald-400 bg-emerald-500/10' },
              { name: 'Design system', priority: 'Done', tag: 'text-emerald-400 bg-emerald-500/10' },
            ]},
          ].map(col => (
            <div key={col.title} className="rounded-lg bg-white/[0.03] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-300">{col.title}</div>
                <div className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">{col.tasks.length}</div>
              </div>
              {col.tasks.map(task => (
                <div key={task.name} className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5 space-y-1.5 hover:border-blue-500/30 transition-colors cursor-grab">
                  <div className="text-[11px] text-white font-medium">{task.name}</div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${task.tag}`}>{task.priority}</span>
                    <div className="w-4 h-4 rounded-full bg-blue-500/30 border border-blue-500/20" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    name: 'ShopVibe',
    category: 'E-Commerce',
    categoryColor: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    prompt: 'Build a modern e-commerce store for handmade candles with product grid, product detail pages, shopping cart with quantity management, checkout flow, and category filtering — with warm aesthetic, dark theme, and smooth page transitions',
    description: 'E-commerce store with cart & checkout',
    icon: ShoppingCart,
    gradient: 'from-orange-600/20 via-amber-600/10 to-yellow-600/20',
    mockupElements: (
      <div className="p-3 space-y-2">
        <div className="flex gap-1.5">
          {['All', 'Candles', 'Sets'].map(t => (
            <div key={t} className="text-[7px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400/60 border border-orange-500/10">{t}</div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="aspect-square rounded bg-gradient-to-br from-orange-500/15 to-amber-500/15 border border-border/20" />
              <div className="h-1 w-3/4 rounded bg-muted/30" />
              <div className="h-1 w-1/2 rounded bg-orange-500/20" />
            </div>
          ))}
        </div>
      </div>
    ),
    expandedMockup: (
      <div className="p-6 bg-[#0c1015] rounded-xl min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-white">ShopVibe</div>
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              {['All', 'Candles', 'Gift Sets', 'Holders'].map(t => (
                <div key={t} className={`text-[10px] px-2.5 py-1 rounded-full border ${t === 'All' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}>{t}</div>
              ))}
            </div>
            <div className="relative">
              <ShoppingCart className="w-4 h-4 text-gray-400" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full text-[7px] text-white flex items-center justify-center font-bold">3</div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { name: 'Vanilla Dream', price: '$24.99' },
            { name: 'Rose Garden', price: '$29.99' },
            { name: 'Ocean Breeze', price: '$22.99' },
            { name: 'Lavender Bliss', price: '$26.99' },
            { name: 'Warm Cinnamon', price: '$19.99' },
            { name: 'Forest Pine', price: '$27.99' },
            { name: 'Honey Glow', price: '$23.99' },
            { name: 'Midnight Jasmine', price: '$31.99' },
          ].map((p, i) => (
            <div key={p.name} className="group rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden hover:border-orange-500/30 transition-all">
              <div className="aspect-square bg-gradient-to-br from-orange-500/15 to-amber-500/15 flex items-center justify-center">
                <div className="text-2xl">{['🕯️', '🌹', '🌊', '💐', '🍯', '🌲', '🍯', '🌙'][i]}</div>
              </div>
              <div className="p-2">
                <div className="text-[11px] text-white font-medium">{p.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] font-semibold text-orange-400">{p.price}</span>
                  <div className="text-[8px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">Add</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    name: 'DevFolio',
    category: 'Portfolio',
    categoryColor: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    prompt: 'Build an AI engineer portfolio website with hero section showing name and role with gradient text, skills section with animated progress bars, project showcase grid with hover effects, experience timeline, and contact form — with dark futuristic theme',
    description: 'Developer portfolio with animations',
    icon: Briefcase,
    gradient: 'from-violet-600/20 via-purple-600/10 to-pink-600/20',
    mockupElements: (
      <div className="p-3 space-y-2">
        <div className="text-center space-y-1">
          <div className="h-2 w-20 mx-auto rounded bg-gradient-to-r from-violet-500/40 to-pink-500/40" />
          <div className="h-1 w-16 mx-auto rounded bg-muted/30" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-violet-500/10 border border-violet-500/10 p-1.5">
              <div className="w-4 h-4 rounded bg-violet-500/20 mb-1" />
              <div className="h-1 w-3/4 rounded bg-muted/30" />
            </div>
          ))}
        </div>
      </div>
    ),
    expandedMockup: (
      <div className="p-6 bg-[#0c1015] rounded-xl min-h-[400px]">
        {/* Hero */}
        <div className="text-center py-6 space-y-2">
          <div className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Alex Chen</div>
          <div className="text-xs text-gray-400">AI Engineer & Full Stack Developer</div>
          <div className="flex justify-center gap-2 mt-2">
            {['GitHub', 'LinkedIn', 'Twitter'].map(s => (
              <div key={s} className="px-2.5 py-1 text-[9px] bg-white/5 text-gray-400 rounded-full border border-white/10">{s}</div>
            ))}
          </div>
        </div>
        {/* Skills */}
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-2">Skills</div>
          <div className="space-y-2">
            {[
              { name: 'React / Next.js', pct: 92 },
              { name: 'Python / FastAPI', pct: 88 },
              { name: 'Machine Learning', pct: 75 },
              { name: 'System Design', pct: 82 },
            ].map(s => (
              <div key={s.name} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-300">{s.name}</span>
                  <span className="text-violet-400">{s.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Projects */}
        <div>
          <div className="text-xs text-gray-400 mb-2">Projects</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'AI Chat Platform', tech: 'Next.js, GPT-4' },
              { name: 'ML Pipeline Tool', tech: 'Python, K8s' },
              { name: 'Real-time Dashboard', tech: 'React, D3.js' },
              { name: 'Voice Assistant', tech: 'Whisper, FastAPI' },
            ].map(p => (
              <div key={p.name} className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5 hover:border-violet-500/30 transition-colors">
                <div className="text-[11px] text-white font-medium">{p.name}</div>
                <div className="text-[9px] text-gray-500 mt-0.5">{p.tech}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    name: 'RecipeBox',
    category: 'Lifestyle',
    categoryColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    prompt: 'Build a recipe manager app where users can browse recipes by cuisine type, view detailed recipe pages with ingredients and step-by-step instructions, save favorites, and create meal plans — with beautiful food-themed dark UI and localStorage',
    description: 'Recipe manager with meal planning',
    icon: BookOpen,
    gradient: 'from-rose-600/20 via-red-600/10 to-orange-600/20',
    mockupElements: (
      <div className="p-3 space-y-2">
        <div className="flex gap-1">
          {['Italian', 'Asian', 'Salads', 'Desserts'].map(e => (
            <div key={e} className="flex-1 text-center py-1 rounded bg-rose-500/10 text-[8px] text-rose-400/60 border border-rose-500/10">{e}</div>
          ))}
        </div>
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-rose-500/20 to-orange-500/20 shrink-0 border border-border/20" />
              <div className="flex-1 space-y-1">
                <div className="h-1.5 w-3/4 rounded bg-muted/40" />
                <div className="h-1 w-1/2 rounded bg-rose-500/15" />
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    expandedMockup: (
      <div className="p-6 bg-[#0c1015] rounded-xl min-h-[400px]">
        <div className="flex gap-2 mb-4">
          {['All', 'Italian', 'Asian', 'Mexican', 'Desserts'].map((c, i) => (
            <div key={c} className={`text-[10px] px-2.5 py-1 rounded-full border ${i === 0 ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-white/5 text-gray-400 border-white/10'}`}>{c}</div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: 'Margherita Pizza', time: '30 min', emoji: '🍕', difficulty: 'Easy' },
            { name: 'Pad Thai', time: '25 min', emoji: '🍜', difficulty: 'Medium' },
            { name: 'Caesar Salad', time: '15 min', emoji: '🥗', difficulty: 'Easy' },
            { name: 'Chocolate Cake', time: '50 min', emoji: '🍰', difficulty: 'Hard' },
            { name: 'Beef Tacos', time: '20 min', emoji: '🌮', difficulty: 'Easy' },
            { name: 'Ramen Bowl', time: '45 min', emoji: '🍜', difficulty: 'Medium' },
          ].map(r => (
            <div key={r.name} className="rounded-lg bg-white/[0.03] border border-white/10 overflow-hidden hover:border-rose-500/30 transition-all">
              <div className="h-20 bg-gradient-to-br from-rose-500/10 to-orange-500/10 flex items-center justify-center text-3xl">{r.emoji}</div>
              <div className="p-2.5">
                <div className="text-[11px] text-white font-medium">{r.name}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-gray-500">{r.time}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded ${r.difficulty === 'Easy' ? 'bg-emerald-500/10 text-emerald-400' : r.difficulty === 'Medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{r.difficulty}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    name: 'FitTrack',
    category: 'Health',
    categoryColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    prompt: 'Build a fitness tracking dashboard with workout logger, exercise library, weekly progress charts showing calories burned and workout duration, personal records tracker, and BMI calculator — with energetic dark theme and smooth animations',
    description: 'Fitness dashboard with progress charts',
    icon: Heart,
    gradient: 'from-cyan-600/20 via-teal-600/10 to-green-600/20',
    mockupElements: (
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          {[
            { label: '2,450', sub: 'kcal' },
            { label: '5', sub: 'workouts' },
            { label: '4.5h', sub: 'total' },
          ].map(s => (
            <div key={s.label} className="flex-1 text-center py-1.5 rounded bg-cyan-500/10 border border-cyan-500/10">
              <div className="text-[8px] font-bold text-cyan-400/80">{s.label}</div>
              <div className="text-[6px] text-muted-foreground/40">{s.sub}</div>
            </div>
          ))}
        </div>
        <div className="h-14 rounded bg-gradient-to-r from-cyan-500/5 to-teal-500/5 border border-border/20 flex items-end p-1.5 gap-0.5">
          {[5, 8, 3, 7, 9, 6, 4].map((h, i) => (
            <div key={i} className="flex-1 rounded-t bg-cyan-500/30" style={{ height: `${h * 10}%` }} />
          ))}
        </div>
      </div>
    ),
    expandedMockup: (
      <div className="p-6 bg-[#0c1015] rounded-xl min-h-[400px]">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Calories', value: '2,450', unit: 'kcal', icon: '🔥' },
            { label: 'Workouts', value: '5', unit: 'this week', icon: '💪' },
            { label: 'Duration', value: '4.5h', unit: 'total', icon: '⏱' },
            { label: 'Streak', value: '12', unit: 'days', icon: '🏆' },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-center">
              <div className="text-lg mb-0.5">{s.icon}</div>
              <div className="text-sm font-bold text-white">{s.value}</div>
              <div className="text-[9px] text-gray-500">{s.unit}</div>
            </div>
          ))}
        </div>
        {/* Chart */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 mb-4">
          <div className="text-xs text-gray-400 mb-3">Weekly Progress</div>
          <div className="h-28 flex items-end gap-2">
            {[
              { day: 'Mon', cal: 65, dur: 45 },
              { day: 'Tue', cal: 80, dur: 60 },
              { day: 'Wed', cal: 30, dur: 20 },
              { day: 'Thu', cal: 70, dur: 50 },
              { day: 'Fri', cal: 90, dur: 75 },
              { day: 'Sat', cal: 55, dur: 35 },
              { day: 'Sun', cal: 40, dur: 25 },
            ].map(d => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex gap-0.5 items-end" style={{ height: '80px' }}>
                  <div className="flex-1 rounded-t bg-cyan-500/50" style={{ height: `${d.cal}%` }} />
                  <div className="flex-1 rounded-t bg-teal-500/30" style={{ height: `${d.dur}%` }} />
                </div>
                <span className="text-[8px] text-gray-500">{d.day}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Recent workouts */}
        <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4">
          <div className="text-xs text-gray-400 mb-2">Recent Workouts</div>
          <div className="space-y-2">
            {[
              { name: 'Upper Body Strength', duration: '45 min', cal: '320 kcal' },
              { name: 'HIIT Cardio', duration: '30 min', cal: '410 kcal' },
              { name: 'Leg Day', duration: '55 min', cal: '380 kcal' },
            ].map(w => (
              <div key={w.name} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-[11px] text-white">{w.name}</div>
                  <div className="text-[9px] text-gray-500">{w.duration}</div>
                </div>
                <span className="text-[10px] text-cyan-400 font-medium">{w.cal}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
]

interface ShowcaseSectionProps {
  onSelectTemplate: (prompt: string) => void
}

export function ShowcaseSection({ onSelectTemplate }: ShowcaseSectionProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  const closePreview = useCallback(() => setPreviewIdx(null), [])

  // Close on Escape
  useEffect(() => {
    if (previewIdx === null) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [previewIdx, closePreview])

  const previewProject = previewIdx !== null ? showcaseProjects[previewIdx] : null

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
          <Sparkles className="w-3 h-3" />
          Showcase
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Built with BuilderAI</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Real apps generated from a single prompt — click to preview or build your own
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {showcaseProjects.map((project, i) => {
          const Icon = project.icon
          const isHovered = hoveredIdx === i

          return (
            <motion.div
              key={project.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 * i }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="group relative"
            >
              <div className={`glass-card rounded-xl overflow-hidden transition-all duration-300 ${isHovered ? 'border-primary/30 shadow-lg shadow-primary/5' : ''}`}>
                {/* Browser chrome */}
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 bg-muted/20">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/40" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/40" />
                    <div className="w-2 h-2 rounded-full bg-green-500/40" />
                  </div>
                  <div className="flex-1 mx-2 h-4 rounded bg-muted/30 flex items-center px-2">
                    <span className="text-[8px] text-muted-foreground/40 truncate">{project.name.toLowerCase()}.app</span>
                  </div>
                </div>

                {/* Preview mockup */}
                <div className={`h-[160px] bg-gradient-to-br ${project.gradient} relative overflow-hidden`}>
                  {project.mockupElements}

                  {/* Hover overlay */}
                  <div className={`absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center gap-3 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    <button
                      onClick={() => setPreviewIdx(i)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary border border-border text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      Preview
                    </button>
                    <button
                      onClick={() => onSelectTemplate(project.prompt)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Build this
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${project.gradient} flex items-center justify-center`}>
                    <Icon className="w-3.5 h-3.5 text-foreground/80" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{project.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{project.description}</p>
                  </div>
                  <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${project.categoryColor}`}>
                    {project.category}
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ── Preview Modal ── */}
      <AnimatePresence>
        {previewProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={closePreview}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal browser chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/30 bg-muted/20">
                <div className="flex gap-1.5">
                  <button onClick={closePreview} className="w-3 h-3 rounded-full bg-red-500/60 hover:bg-red-500 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                  <div className="w-3 h-3 rounded-full bg-green-500/40" />
                </div>
                <div className="flex-1 mx-3 h-6 rounded-lg bg-muted/30 flex items-center px-3">
                  <span className="text-[11px] text-muted-foreground/60">{previewProject.name.toLowerCase()}.app</span>
                </div>
                <button
                  onClick={closePreview}
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal content */}
              <div className="overflow-y-auto max-h-[calc(85vh-100px)]">
                {previewProject.expandedMockup}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-card/80">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${previewProject.categoryColor}`}>
                    {previewProject.category}
                  </span>
                  <span className="text-xs text-muted-foreground">{previewProject.description}</span>
                </div>
                <button
                  onClick={() => {
                    onSelectTemplate(previewProject.prompt)
                    closePreview()
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Build this app
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
