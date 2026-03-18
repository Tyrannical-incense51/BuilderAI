'use client'

import { useRef, useState, useMemo, useEffect, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Html, OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

// ─── Agent Node Data ───
const agents = [
  { name: 'Architect', color: '#8b5cf6', pos: [-4, 0, 0] as [number, number, number], desc: 'Plans your app structure' },
  { name: 'Frontend', color: '#06b6d4', pos: [-1.2, 1.2, 0] as [number, number, number], desc: 'Builds the UI components' },
  { name: 'Backend', color: '#10b981', pos: [-1.2, -1.2, 0] as [number, number, number], desc: 'Creates API & database' },
  { name: 'Assembler', color: '#f59e0b', pos: [1.5, 0, 0] as [number, number, number], desc: 'Connects everything together' },
  { name: 'Finalizer', color: '#3b82f6', pos: [4, 0, 0] as [number, number, number], desc: 'Validates & packages' },
]

const connections: [number, number][] = [
  [0, 1], [0, 2], // Architect → Frontend, Backend
  [1, 3], [2, 3], // Frontend, Backend → Assembler
  [3, 4],         // Assembler → Finalizer
]

// ─── Animated Sphere Node ───
function AgentNode({ position, color, name, index, activeStep }: {
  position: [number, number, number]
  color: string
  name: string
  index: number
  activeStep: number
}) {
  const meshRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const [hovered, setHovered] = useState(false)

  const isActive = index === activeStep
  const isDone = index < activeStep

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.3
    }
    if (glowRef.current) {
      const targetScale = isActive ? 1.6 : hovered ? 1.3 : 1
      glowRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08)
    }
  })

  const emissiveIntensity = isActive ? 0.8 : isDone ? 0.4 : hovered ? 0.5 : 0.1

  return (
    <Float speed={2} rotationIntensity={0.3} floatIntensity={0.5}>
      <group position={position}>
        {/* Outer glow sphere */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[0.55, 32, 32]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={isActive ? 0.15 : isDone ? 0.08 : 0.04}
            depthWrite={false}
          />
        </mesh>

        {/* Main sphere */}
        <mesh
          ref={meshRef}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <icosahedronGeometry args={[0.38, 1]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            roughness={0.2}
            metalness={0.8}
            wireframe={!isDone && !isActive}
          />
        </mesh>

        {/* Label */}
        <Html position={[0, -0.75, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <span style={{
            color: isActive ? color : isDone ? '#94a3b8' : '#64748b',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}>
            {name}
          </span>
        </Html>

        {/* Active pulse ring */}
        {isActive && <PulseRing color={color} />}
      </group>
    </Float>
  )
}

// ─── Pulse Ring Effect ───
function PulseRing({ color }: { color: string }) {
  const ringRef = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    if (ringRef.current) {
      const t = (state.clock.getElapsedTime() % 2) / 2
      ringRef.current.scale.setScalar(1 + t * 1.5)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - t)
    }
  })

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.45, 32]} />
      <meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

// ─── Connection Beam ───
function ConnectionBeam({ from, to, isActive, isDone }: {
  from: [number, number, number]
  to: [number, number, number]
  isActive: boolean
  isDone: boolean
}) {
  const ref = useRef<THREE.Group>(null!)

  const lineObj = useMemo(() => {
    const start = new THREE.Vector3(...from)
    const end = new THREE.Vector3(...to)
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    mid.z += 0.3
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const pts = curve.getPoints(24)
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const color = isDone ? '#22c55e' : isActive ? '#eab308' : '#334155'
    const opacity = isDone ? 0.6 : isActive ? 0.8 : 0.2
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    return new THREE.Line(geometry, material)
  }, [from, to, isActive, isDone])

  return <primitive ref={ref} object={lineObj} />
}

// ─── Particle Field ───
function ParticleField() {
  const particlesRef = useRef<THREE.Points>(null!)
  const count = 200

  const geometry = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 3
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useFrame((_, delta) => {
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * 0.02
    }
  })

  return (
    <points ref={particlesRef} geometry={geometry}>
      <pointsMaterial size={0.02} color="#4f46e5" transparent opacity={0.4} sizeAttenuation />
    </points>
  )
}

// ─── Scene ───
function PipelineScene() {
  const [activeStep, setActiveStep] = useState(0)

  // Animate through pipeline steps
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % (agents.length + 1))
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[5, 5, 5]} intensity={0.6} color="#8b5cf6" />
      <pointLight position={[-5, -3, 3]} intensity={0.3} color="#06b6d4" />
      <pointLight position={[0, 3, -3]} intensity={0.2} color="#f59e0b" />

      <Stars radius={15} depth={30} count={1500} factor={2} saturation={0.3} fade speed={0.5} />
      <ParticleField />

      {/* Agent nodes */}
      {agents.map((agent, i) => (
        <AgentNode
          key={agent.name}
          position={agent.pos}
          color={agent.color}
          name={agent.name}
          index={i}
          activeStep={activeStep}
        />
      ))}

      {/* Connection beams */}
      {connections.map(([fromIdx, toIdx], i) => (
        <ConnectionBeam
          key={i}
          from={agents[fromIdx].pos}
          to={agents[toIdx].pos}
          isActive={fromIdx === activeStep || toIdx === activeStep}
          isDone={fromIdx < activeStep && toIdx < activeStep}
        />
      ))}

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.4}
        enableZoom={false}
        enablePan={false}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 3}
      />
    </>
  )
}

// ─── Exported Component ───
export function Pipeline3D() {
  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <p className="text-sm text-muted-foreground mt-2">
          5 AI agents collaborate to build your app from a single prompt
        </p>
      </div>

      <div className="relative rounded-2xl border border-border/30 bg-background/50 overflow-hidden">
        <div className="h-[400px] md:h-[450px]">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Loading 3D scene...</p>
              </div>
            </div>
          }>
            <Canvas
              camera={{ position: [0, 2, 8], fov: 45 }}
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: true }}
              style={{ background: 'transparent' }}
            >
              <PipelineScene />
            </Canvas>
          </Suspense>
        </div>

        {/* Bottom info strip */}
        <div className="border-t border-border/20 px-6 py-3 flex items-center justify-center gap-6 bg-card/30">
          {agents.map((agent) => (
            <div key={agent.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
              <span className="text-[11px] text-muted-foreground">{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
