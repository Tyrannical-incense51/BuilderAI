import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const VERCEL_API = 'https://api.vercel.com'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Not available in dev mode' }, { status: 400 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, generated_files, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project.generated_files || Object.keys(project.generated_files as Record<string, string>).length === 0) {
    return NextResponse.json({ error: 'No files to deploy' }, { status: 400 })
  }

  // Load Vercel token
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error: missing service credentials' }, { status: 503 })
  }
  const adminClient = createServiceClient(serviceUrl, serviceKey)

  const { data: profile } = await adminClient
    .from('profiles')
    .select('vercel_token')
    .eq('id', user.id)
    .single()

  if (!profile?.vercel_token) {
    return NextResponse.json(
      { error: 'Vercel not connected. Please add your Vercel token in Settings.' },
      { status: 401 }
    )
  }

  const vercelToken = profile.vercel_token
  const files = project.generated_files as Record<string, string>

  // Pre-deploy: scan imports and patch package.json with missing dependencies
  try {
    const pkgRaw = files['package.json']
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw)
      const allDeps = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ])

      // Scan all source files for import statements
      const importPattern = /(?:from\s+['"]|import\s+['"]|require\s*\(\s*['"])(@?[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?)/g
      const detectedPackages = new Set<string>()

      for (const [filePath, content] of Object.entries(files)) {
        if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(filePath)) continue
        let match
        while ((match = importPattern.exec(content)) !== null) {
          const pkg_name = match[1]
          // Skip relative imports, path aliases, and Node builtins
          if (pkg_name.startsWith('.') || pkg_name.startsWith('@/') || pkg_name.startsWith('~/')) continue
          // Get the package name (handle scoped packages like @radix-ui/react-avatar)
          const fullImport = content.slice(match.index).match(/(?:from\s+['"]|import\s+['"]|require\s*\(\s*['"])([^'"]+)/)?.[1]
          if (!fullImport || fullImport.startsWith('.') || fullImport.startsWith('@/') || fullImport.startsWith('~/')) continue
          const packageName = fullImport.startsWith('@')
            ? fullImport.split('/').slice(0, 2).join('/')
            : fullImport.split('/')[0]
          if (packageName && !['react', 'react-dom', 'next', 'fs', 'path', 'os', 'url', 'crypto', 'stream', 'util', 'http', 'https', 'events', 'buffer', 'child_process', 'net', 'tls', 'dns', 'cluster', 'zlib'].includes(packageName)) {
            detectedPackages.add(packageName)
          }
        }
      }

      // Find missing packages and add them
      const missing: string[] = []
      for (const dep of detectedPackages) {
        if (!allDeps.has(dep)) {
          missing.push(dep)
        }
      }

      if (missing.length > 0) {
        if (!pkg.dependencies) pkg.dependencies = {}
        for (const dep of missing) {
          pkg.dependencies[dep] = 'latest'
        }
        files['package.json'] = JSON.stringify(pkg, null, 2)
        console.log(`[deploy] Auto-added missing dependencies: ${missing.join(', ')}`)
      }
    }
  } catch (e) {
    console.error('[deploy] Dependency scan failed (non-fatal):', e)
  }

  try {
    // Step 0: Validate token by calling Vercel user endpoint
    const tokenCheck = await fetch(`${VERCEL_API}/v2/user`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    })
    if (!tokenCheck.ok) {
      const status = tokenCheck.status
      if (status === 401 || status === 403) {
        return NextResponse.json(
          { error: 'Vercel token is invalid or expired. Please update it in Settings.' },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { error: `Vercel API returned ${status} — token may be misconfigured` },
        { status: 502 }
      )
    }

    // Step 1: Upload each file to Vercel
    const fileManifest: { file: string; sha: string; size: number }[] = []
    const uploadErrors: string[] = []

    const BATCH_SIZE = 10
    const entries = Object.entries(files)

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async ([filePath, content]) => {
          const buffer = Buffer.from(content, 'utf-8')
          const sha = crypto.createHash('sha1').update(buffer).digest('hex')

          const uploadRes = await fetch(`${VERCEL_API}/v2/files`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/octet-stream',
              'x-vercel-digest': sha,
              'Content-Length': String(buffer.length),
            },
            body: buffer,
          })

          // 200 = uploaded, 409 = already exists — both OK
          if (!uploadRes.ok && uploadRes.status !== 409) {
            const errText = await uploadRes.text().catch(() => '')
            console.error(`[deploy] File upload failed: ${filePath} → ${uploadRes.status} ${errText}`)
            if (uploadRes.status === 403) {
              throw new Error(
                'Vercel returned 403 Forbidden on file upload. Your token may lack deployment permissions. ' +
                'Make sure you created a "Full Access" token at vercel.com/account/tokens.'
              )
            }
            uploadErrors.push(`${filePath}: ${uploadRes.status}`)
            return // skip this file but continue others
          }

          fileManifest.push({ file: filePath, sha, size: buffer.length })
        })
      )
    }

    if (fileManifest.length === 0) {
      return NextResponse.json(
        { error: `All file uploads failed: ${uploadErrors.join(', ')}` },
        { status: 502 }
      )
    }

    // Step 2: Detect framework from generated files
    const filePaths = Object.keys(files)
    const hasNextConfig = filePaths.some(f => f.match(/^next\.config\.(js|ts|mjs)$/))
    const hasViteConfig = filePaths.some(f => f.match(/^vite\.config\.(js|ts|mjs)$/))
    const hasIndexHtml = filePaths.includes('index.html')

    // Read package.json to detect framework hints
    let pkgJson: Record<string, unknown> = {}
    try {
      const pkgContent = files['package.json']
      if (pkgContent) pkgJson = JSON.parse(pkgContent)
    } catch { /* ignore parse errors */ }

    const deps = { ...(pkgJson.dependencies as Record<string, string> || {}), ...(pkgJson.devDependencies as Record<string, string> || {}) }
    const hasNextDep = !!deps['next']
    const hasViteDep = !!deps['vite']
    const scripts = (pkgJson.scripts as Record<string, string>) || {}

    let framework: string | null = null
    let buildCommand = 'npm run build'
    let outputDirectory: string | undefined

    if (hasNextConfig || hasNextDep) {
      framework = 'nextjs'
      outputDirectory = '.next'
    } else if (hasViteConfig || hasViteDep) {
      framework = 'vite'
      outputDirectory = 'dist'
    } else if (hasIndexHtml && !scripts.build) {
      // Static HTML site — no build needed
      framework = null
      buildCommand = ''
      outputDirectory = '.'
    } else if (hasIndexHtml) {
      // Has index.html + build script — likely CRA or similar
      framework = null
      outputDirectory = 'build'
    }

    // Step 3: Create deployment
    const projectSlug = project.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)

    const projectSettings: Record<string, unknown> = {
      installCommand: 'npm install',
    }
    if (framework) projectSettings.framework = framework
    if (buildCommand) projectSettings.buildCommand = buildCommand
    if (outputDirectory) projectSettings.outputDirectory = outputDirectory

    const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectSlug,
        files: fileManifest,
        projectSettings,
        target: 'production',
      }),
    })

    if (!deployRes.ok) {
      const errBody = await deployRes.json().catch(() => ({ error: { message: deployRes.statusText } }))
      const errMsg = errBody.error?.message || errBody.message || `Vercel API error: ${deployRes.status}`
      return NextResponse.json({ error: errMsg }, { status: 502 })
    }

    const deployment = await deployRes.json() as {
      id: string
      url: string
      readyState: string
    }

    const deploymentUrl = `https://${deployment.url}`

    // Store deployment info in project metadata
    const existingMeta = (project.metadata as Record<string, unknown>) || {}
    await adminClient
      .from('projects')
      .update({
        metadata: {
          ...existingMeta,
          deployment_url: deploymentUrl,
          deployment_id: deployment.id,
          deployed_at: new Date().toISOString(),
        },
      })
      .eq('id', id)

    return NextResponse.json({
      url: deploymentUrl,
      deploymentId: deployment.id,
      state: deployment.readyState,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deployment failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
