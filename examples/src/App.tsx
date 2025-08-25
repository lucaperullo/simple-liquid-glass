import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import LiquidGlass, { type LiquidGlassProps } from 'simple-liquid-glass'

type Mode = 'preset' | 'custom'
type Controls = Pick<
  LiquidGlassProps,
  | 'mode'
  | 'scale'
  | 'radius'
  | 'border'
  | 'lightness'
  | 'displace'
  | 'alpha'
  | 'blur'
  | 'dispersion'
  | 'frost'
  | 'borderColor'
  | 'background'
>

const BACKGROUNDS: { name: string; css: string }[] = [
  { name: 'Light', css: '#f5f5f5' },
  { name: 'Dark', css: '#1f1f1f' },
  { name: 'Checkerboard', css: 'repeating-conic-gradient(#e0e0e0 0% 25%, #ffffff 0% 50%) 50% / 16px 16px' },
  { name: 'Blue', css: '#0e7490' },
  { name: 'Gradient', css: 'linear-gradient(135deg, #111827 0%, #0ea5e9 100%)' },
  { name: 'Rainbow', css: 'linear-gradient(45deg, #ff0000, #ff8000, #ffff00, #80ff00, #00ff00, #00ff80, #00ffff, #0080ff, #0000ff, #8000ff, #ff00ff, #ff0080)' },
  { name: 'Sunset', css: 'linear-gradient(to right, #ff512f, #f09819)' },
  { name: 'Ocean', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { name: 'Mountains', css: 'url("https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
  { name: 'City Night', css: 'url("https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
  { name: 'Ocean Image', css: 'url("https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
  { name: 'Forest', css: 'url("https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
  { name: 'Abstract', css: 'url("https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1920&q=80") center / cover no-repeat fixed' },
]

function Draggable({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const draggableRef = useRef<HTMLDivElement | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [withTransition, setWithTransition] = useState(false)

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (pointerIdRef.current === null) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    setOffset({ x: dx, y: dy })
  }, [])

  const endDrag = useCallback(() => {
    pointerIdRef.current = null
    setWithTransition(true)
    setOffset({ x: 0, y: 0 })
    const timeout = setTimeout(() => setWithTransition(false), 300)
    return () => clearTimeout(timeout)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!draggableRef.current) return
    draggableRef.current.setPointerCapture(e.pointerId)
    pointerIdRef.current = e.pointerId
    startRef.current = { x: e.clientX, y: e.clientY }
    setWithTransition(false)
  }, [])

  useEffect(() => {
    const handleUp = () => {
      if (pointerIdRef.current === null) return
      endDrag()
    }
    const handleCancel = () => {
      if (pointerIdRef.current === null) return
      endDrag()
    }
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [endDrag])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [onPointerMove])

  return (
    <div
      ref={draggableRef}
      onPointerDown={onPointerDown}
      style={{
        position: 'relative',
        width,
        height,
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: withTransition ? 'transform 300ms cubic-bezier(0.2, 0, 0, 1)' : 'none',
        cursor: 'grab',
      }}
    >
      {children}
    </div>
  )
}

function useControlsDefaults(mode: Mode): Controls {
  return useMemo(
    () => ({
      mode,
      scale: 160,
      radius: 50,
      border: 0.05,
      lightness: 53,
      displace: 0.38,
      alpha: 0.9,
      blur: 5,
      dispersion: 50,
      frost: 0.1,
      borderColor: 'rgba(120, 120, 120, 0.7)',
    }),
    [mode]
  )
}

function App() {
  const [background, setBackground] = useState(BACKGROUNDS[0])
  const [mode, setMode] = useState<Mode>('preset')
  const defaults = useControlsDefaults(mode)
  const [controls, setControls] = useState<Controls>({ ...defaults })

  useEffect(() => {
    setControls(prev => ({ ...prev, mode }))
  }, [mode])

  const set = <K extends keyof Controls>(key: K, value: Controls[K]) =>
    setControls(prev => ({ ...prev, [key]: value }))

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: background.css,
        color: '#111',
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: 24,
        alignItems: 'center',
        padding: 24,
      }}
    >
      <section className="panel">
        <h1 style={{ marginTop: 0 }}>Liquid Glass Showcase</h1>
        <div className="control">
          <label>Background</label>
          <select
            value={background.name}
            onChange={(e) => setBackground(BACKGROUNDS.find(b => b.name === e.target.value) || BACKGROUNDS[0])}
          >
            {BACKGROUNDS.map(bg => (
              <option key={bg.name} value={bg.name}>{bg.name}</option>
            ))}
          </select>
        </div>

        <div className="control">
          <label>Mode</label>
          <div className="radio-group">
            <label><input type="radio" checked={mode === 'preset'} onChange={() => setMode('preset')} /> preset</label>
            <label><input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} /> custom</label>
          </div>
        </div>

        <div className="grid2">
          <label>Radius {controls.radius}
            <input type="range" min={0} max={200} value={controls.radius}
              onChange={e => set('radius', Number(e.target.value))} />
          </label>
          <label>Scale {controls.scale}
            <input type="range" min={0} max={400} value={controls.scale}
              onChange={e => set('scale', Number(e.target.value))} />
          </label>
          <label>Border {controls.border}
            <input type="range" min={0} max={0.5} step={0.01} value={controls.border}
              onChange={e => set('border', Number(e.target.value))} />
          </label>
          <label>Lightness {controls.lightness}
            <input type="range" min={0} max={100} value={controls.lightness}
              onChange={e => set('lightness', Number(e.target.value))} />
          </label>
          <label>Displace {controls.displace}
            <input type="range" min={0} max={2} step={0.01} value={controls.displace}
              onChange={e => set('displace', Number(e.target.value))} />
          </label>
          <label>Alpha {controls.alpha}
            <input type="range" min={0} max={1} step={0.01} value={controls.alpha}
              onChange={e => set('alpha', Number(e.target.value))} />
          </label>
          <label>Blur {controls.blur}
            <input type="range" min={0} max={20} value={controls.blur}
              onChange={e => set('blur', Number(e.target.value))} />
          </label>
          <label>Dispersion {controls.dispersion}
            <input type="range" min={0} max={200} value={controls.dispersion}
              onChange={e => set('dispersion', Number(e.target.value))} />
          </label>
          <label>Frost {controls.frost}
            <input type="range" min={0} max={1} step={0.01} value={controls.frost}
              onChange={e => set('frost', Number(e.target.value))} />
          </label>
          <label>Border color
            <input type="color" value={toColorHex(controls.borderColor as string)}
              onChange={e => set('borderColor', e.target.value as Controls['borderColor'])} />
          </label>
        </div>

        <button className="reset" onClick={() => { setMode('preset'); setControls({ ...useControlsDefaults('preset') }) }}>Reset</button>
      </section>

      <section style={{ display: 'grid', placeItems: 'center' }}>
        <Draggable width={520} height={300}>
          <div style={{ width: 520, height: 300 }}>
            <LiquidGlass {...controls} background={background.css}>
              <div style={{
                width: '100%',
                height: '100%',
                display: 'grid',
                placeItems: 'center',
                color: '#111',
                fontWeight: 700,
              }}>
                Drag me
              </div>
            </LiquidGlass>
          </div>
        </Draggable>
      </section>
    </div>
  )
}

function toColorHex(input: string): string {
  if (input.startsWith('#')) return input
  const match = input.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (!match) return '#777777'
  const r = Number(match[1]).toString(16).padStart(2, '0')
  const g = Number(match[2]).toString(16).padStart(2, '0')
  const b = Number(match[3]).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

export default App
