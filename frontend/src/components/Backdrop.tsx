// Page background: the page colour plus a few organic "splashes" (bursts of petals, like a flower seen from above)
// tucked into the corners and edges. Each page gets its own arrangement, picked from its address so it looks random
// but stays put. Purely decorative (aria-hidden); cards sit on top, so text is always on a clean surface.

export type BackdropVariant = 'soft' | 'bold'

type Burst = { x: string; y: string; size: number; rotate: number; petals?: number; tone: 'pink' | 'white' }

// Arrangements: bursts sit mostly off-screen at the edges so only petals peek in.
const LAYOUTS: Burst[][] = [
  [{ x: '100%', y: '0%', size: 560, rotate: 205, tone: 'pink' }, { x: '0%', y: '100%', size: 460, rotate: 25, tone: 'pink' }, { x: '62%', y: '104%', size: 240, rotate: 140, petals: 3, tone: 'white' }],
  [{ x: '0%', y: '4%', size: 500, rotate: 130, tone: 'pink' }, { x: '100%', y: '72%', size: 520, rotate: 255, tone: 'pink' }, { x: '96%', y: '-4%', size: 220, rotate: 190, petals: 3, tone: 'white' }],
  [{ x: '100%', y: '100%', size: 600, rotate: 300, tone: 'pink' }, { x: '-2%', y: '38%', size: 300, rotate: 80, petals: 3, tone: 'pink' }, { x: '88%', y: '2%', size: 260, rotate: 175, petals: 3, tone: 'white' }],
  [{ x: '6%', y: '100%', size: 540, rotate: 10, tone: 'pink' }, { x: '100%', y: '18%', size: 420, rotate: 230, tone: 'pink' }, { x: '0%', y: '-2%', size: 230, rotate: 120, petals: 3, tone: 'white' }],
]

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export function Backdrop({ variant = 'soft', seed = '' }: { variant?: BackdropVariant; seed?: string }) {
  void variant
  const layout = LAYOUTS[hash(seed) % LAYOUTS.length]
  return (
    // Sticky + negative margin: stays in view while the page scrolls, without taking up space.
    <div className="page-wash pointer-events-none sticky top-0 -z-10 -mb-[100vh] h-screen overflow-hidden" aria-hidden>
      {layout.map((b, i) => <Splash key={i} {...b} />)}
    </div>
  )
}

/** One splash: 3-5 rounded petals fanning out from a point. Colour and strength come from CSS (.splash-pink/.splash-white). */
export function Splash({ x, y, size, rotate, petals = 4, tone, className = '' }: Burst & { className?: string }) {
  // Petal pointing up from the origin: narrow where it starts, round and full at the tip.
  const petal = 'M0 0 C -6 -42 -36 -98 -36 -148 C -36 -182 -12 -197 9 -192 C 33 -185 38 -150 29 -110 C 20 -68 6 -30 0 0 Z'
  const spread = petals === 3 ? [-50, 0, 52] : petals === 5 ? [-84, -42, 0, 42, 86] : [-72, -24, 24, 70]
  const scale = [0.86, 1, 0.92, 1.06, 0.8]
  return (
    <svg viewBox="-200 -200 400 400" className={`splash-${tone} absolute ${className}`}
      style={{ left: x, top: y, width: size, height: size, transform: `translate(-50%, -50%) rotate(${rotate}deg)` }}>
      {spread.map((a, i) => <path key={i} d={petal} transform={`rotate(${a}) scale(${scale[i % scale.length]})`} />)}
    </svg>
  )
}
