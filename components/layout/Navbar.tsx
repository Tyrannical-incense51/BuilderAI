'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Zap, Download, Save, LogOut, User, Home, FolderOpen, Settings, Menu, X, Command, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface NavbarProps {
  projectName?: string
  onSave?: () => void
  onDownload?: () => void
  onShare?: () => void
  user?: {
    id: string
    email?: string
    display_name?: string
    avatar_url?: string
  } | null
}

const navLinks = [
  { href: '/projects', icon: FolderOpen, label: 'Projects' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function Navbar({ projectName, onSave, onDownload, onShare, user }: NavbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut()
    }
    toast.success('Signed out', { description: 'See you next time!' })
    router.push('/')
    router.refresh()
  }

  const initials = user?.display_name
    ? user.display_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'U'

  return (
    <>
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center px-4 gap-4 z-50 relative">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm hidden sm:block gradient-text">BuilderAI</span>
        </Link>

        {/* Project breadcrumb (shown on project pages) */}
        {projectName && (
          <>
            <span className="text-border text-lg">/</span>
            <span className="text-sm font-medium text-foreground truncate max-w-48">
              {projectName}
            </span>
          </>
        )}

        {/* Desktop nav links */}
        {!projectName && (
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {navLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + '/')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <link.icon className="w-4 h-4" />
                  {link.label}
                </Link>
              )
            })}
          </nav>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Project actions */}
        {onSave && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:block">Save</span>
          </Button>
        )}

        {onShare && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShare}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:block">Share</span>
          </Button>
        )}

        {onDownload && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDownload}
            className="gap-1.5 border-border"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:block">Download</span>
          </Button>
        )}

        {/* ⌘K hint — only in project view, desktop only */}
        {projectName && (
          <kbd className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground bg-muted border border-border px-2 py-1 rounded-md cursor-default select-none">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        )}

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="w-7 h-7">
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className="bg-primary text-white text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.display_name || 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="gap-2 cursor-pointer">
                  <Home className="w-4 h-4" />
                  Home
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/projects" className="gap-2 cursor-pointer">
                  <FolderOpen className="w-4 h-4" />
                  Projects
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="gap-2 cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={handleLogout}
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Mobile hamburger (only on non-project pages) */}
        {!projectName && (
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}
      </header>

      {/* Mobile nav overlay */}
      <AnimatePresence>
        {mobileMenuOpen && !projectName && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-b border-border bg-card/95 backdrop-blur-md z-40 overflow-hidden"
          >
            <nav className="p-3 space-y-1">
              {navLinks.map((link) => {
                const active = pathname === link.href || pathname.startsWith(link.href + '/')
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    )}
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                )
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
