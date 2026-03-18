import { z } from 'zod'

export const chatRequestSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  content: z.string().min(1, 'Message cannot be empty').max(10000, 'Message too long (max 10,000 characters)'),
  llmMode: z.enum(['cli', 'api']).optional().default('cli'),
  apiModel: z.string().optional().nullable(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'agent']),
    content: z.string(),
  })).optional().default([]),
})

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Project name too long'),
  prompt: z.string().min(1, 'Prompt is required').max(10000, 'Prompt too long (max 10,000 characters)'),
  description: z.string().max(500, 'Description too long').optional().default(''),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['draft', 'building', 'complete', 'failed']).optional(),
  generated_files: z.record(z.string(), z.string()).optional(),
  blueprint: z.unknown().optional(),
})

export const githubPushSchema = z.object({
  repoName: z.string().min(1).max(100).optional(),
  isPrivate: z.boolean().optional().default(false),
})

export const vercelTokenSchema = z.object({
  token: z.string().min(20, 'Invalid Vercel token'),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>
export type CreateProjectRequest = z.infer<typeof createProjectSchema>
export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>
export type GitHubPushRequest = z.infer<typeof githubPushSchema>
export type VercelTokenRequest = z.infer<typeof vercelTokenSchema>
