// Holo Command UI — token bridge.
// The design reference hardcodes hex values with hex-alpha suffixes
// ({accent}14, {accent}30…). Everything here resolves to tokens.css vars via
// color-mix, matching how --phx-edge derives its alpha.

export const ACC = 'var(--phx-accent)'
export const SCENE = 'var(--phx-finance)' // scene base is always finance cyan
export const G = 'var(--phx-positive)'
export const Y = 'var(--phx-caution)'
export const R = 'var(--phx-danger)'
export const W = 'var(--phx-text)'
export const TEXT = 'var(--phx-text)'
export const BODY = 'var(--phx-body)'
export const MUTED = 'var(--phx-muted)'
export const BG = 'var(--phx-bg)'
export const PANEL = 'var(--phx-panel)'
export const RAISED = 'var(--phx-panel-raised)'
export const FD = 'var(--phx-font-display)'
export const FB = 'var(--phx-font-body)'
export const FM = 'var(--phx-font-mono)'

// HOME accent — per the handoff README this one is deliberately not tokenized
// (the opening screen's --cyan-br).
export const HOME_ACCENT = '#7df0ff'

export const mix = (color, pct) =>
  `color-mix(in srgb, ${color} ${Math.round(pct * 10) / 10}%, transparent)`

// hex-alpha suffix → percentage color-mix ('30' → 18.8%)
export const a = (color, hex2) => mix(color, (parseInt(hex2, 16) / 255) * 100)

// ink color for text sitting on an accent-filled button
export const INK = 'var(--phx-bg)'

// near-black translucent glass fill (the reference's rgba(1,8,12,.x))
export const deep = pct => mix('var(--phx-bg)', pct)

export const scopeClass = {
  home: '',
  finance: 'phx-scope-finance',
  nutrition: 'phx-scope-nutrition',
  training: 'phx-scope-training',
  calendar: 'phx-scope-calendar',
}

// sparkline geometry used by PERFORMANCE / FUEL GRAPH / TELEMETRY / RHYTHM panels
export function spark(vals, label, big, delta, deltaColor) {
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const nx = i => 4 + (i / (vals.length - 1)) * 122
  const ny = v => 33 - ((v - min) / (max - min || 1)) * 28
  const pts = vals.map((v, i) => nx(i).toFixed(1) + ',' + ny(v).toFixed(1)).join(' ')
  return {
    type: 'spark',
    big,
    delta,
    deltaColor,
    points: pts,
    pointsArea: pts + ' 126,36 4,36',
    lastX: nx(vals.length - 1).toFixed(1),
    lastY: ny(vals[vals.length - 1]).toFixed(1),
    sparkLabel: label,
  }
}

export const pad2 = x => String(x).padStart(2, '0')
