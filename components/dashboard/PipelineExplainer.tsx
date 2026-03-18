'use client'

import { motion } from 'framer-motion'
import { Brain, Layout, Server, Merge, ShieldCheck, Package } from 'lucide-react'

const stages = [
  {
    icon: Brain,
    label: 'Architect',
    description: 'Plans your app structure',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    icon: Layout,
    label: 'Frontend',
    description: 'Builds the UI',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    parallel: true,
  },
  {
    icon: Server,
    label: 'Backend',
    description: 'Builds the API',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    parallel: true,
  },
  {
    icon: Merge,
    label: 'Integrator',
    description: 'Connects everything',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: ShieldCheck,
    label: 'QA',
    description: 'Tests & validates',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    icon: Package,
    label: 'Packager',
    description: 'Ships your app',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
]

export function PipelineExplainer() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-lg font-semibold text-foreground">How it works</h2>
        <p className="text-sm text-muted-foreground mt-1">
          6 AI agents collaborate to build your app from a single prompt
        </p>
      </div>

      {/* Pipeline flow */}
      <div className="relative">
        {/* Desktop layout */}
        <div className="hidden md:flex items-center justify-between gap-2">
          {stages.map((stage, i) => {
            const Icon = stage.icon
            const isParallel = stage.parallel

            return (
              <div key={stage.label} className="flex items-center gap-2">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 * i }}
                  className="flex flex-col items-center gap-2 relative"
                >
                  {/* Parallel indicator */}
                  {isParallel && i === 1 && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-[calc(200%+2rem)] flex items-center justify-center">
                      <span className="text-[10px] text-muted-foreground bg-background px-2">parallel</span>
                    </div>
                  )}

                  {/* Icon node */}
                  <div className={`w-12 h-12 rounded-xl ${stage.bg} flex items-center justify-center border border-border/50`}>
                    <Icon className={`w-5 h-5 ${stage.color}`} />
                  </div>

                  {/* Label */}
                  <div className="text-center">
                    <p className="text-xs font-semibold">{stage.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 max-w-20">
                      {stage.description}
                    </p>
                  </div>
                </motion.div>

                {/* Connector arrow */}
                {i < stages.length - 1 && (
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.3, delay: 0.15 * i + 0.2 }}
                    className="flex items-center self-start mt-5"
                  >
                    <div className="w-8 h-px bg-gradient-to-r from-border to-border/50" />
                    <div className="w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent border-l-border/50" />
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>

        {/* Mobile layout: vertical */}
        <div className="md:hidden space-y-3">
          {stages.map((stage, i) => {
            const Icon = stage.icon

            return (
              <motion.div
                key={stage.label}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.08 * i }}
                className="flex items-center gap-4"
              >
                <div className={`w-10 h-10 rounded-lg ${stage.bg} flex items-center justify-center shrink-0 border border-border/50`}>
                  <Icon className={`w-4 h-4 ${stage.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{stage.label}</p>
                  <p className="text-xs text-muted-foreground">{stage.description}</p>
                </div>
                {stage.parallel && (
                  <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    parallel
                  </span>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
