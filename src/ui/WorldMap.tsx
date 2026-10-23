import { useEffect, useMemo, useState } from 'react'

// The world-atlas country outlines (Natural Earth, 1:110m) drawn as SVG paths.
// The file is TopoJSON: shared borders are stored once as delta-encoded,
// quantized "arcs", and each country lists the arcs around it. Decoding that
// is a few lines, so no geo library is needed; the projection is a plain
// equirectangular one, cropped to leave out Antarctica.

type Topology = {
  transform: { scale: [number, number]; translate: [number, number] }
  arcs: [number, number][][]
  objects: { countries: { geometries: { id?: string; type: string; arcs: number[][] | number[][][]; properties: { name: string } }[] } }
}

export type MapCountry = { key: string; name: string; d: string }

const W = 960
const TOP = 84 // latitude at the top edge
const BOTTOM = -58 // and the bottom, below the southern tip of South America
const H = Math.round((W * (TOP - BOTTOM)) / 360)

let loaded: Promise<MapCountry[]> | null = null

function loadCountries(): Promise<MapCountry[]> {
  loaded ??= import('world-atlas/countries-110m.json').then((m) => decode(m.default as unknown as Topology))
  return loaded
}

function decode(t: Topology): MapCountry[] {
  const [sx, sy] = t.transform.scale
  const [tx, ty] = t.transform.translate
  // Arcs as longitude and latitude.
  const arcs = t.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map(([dx, dy]) => {
      x += dx
      y += dy
      return [x * sx + tx, y * sy + ty] as [number, number]
    })
  })
  const project = (lon: number, lat: number) => `${(((lon + 180) / 360) * W).toFixed(1)},${(((TOP - lat) / (TOP - BOTTOM)) * H).toFixed(1)}`
  const ring = (indexes: number[]) => {
    const pts: [number, number][] = []
    indexes.forEach((i, n) => {
      const arc = i >= 0 ? arcs[i] : [...arcs[~i]].reverse()
      pts.push(...(n === 0 ? arc : arc.slice(1)))
    })
    // Rings that cross the 180th meridian (eastern Russia, Fiji) jump from one
    // edge of the map to the other. Unwrap them so they run off one edge, and
    // draw them again shifted a full turn so the part past the edge shows on the other side.
    let shift = 0
    const lons = pts.map(([lon], k) => {
      if (k > 0) {
        const jump = lon + shift - (pts[k - 1][0] + shift)
        if (jump > 180) shift -= 360
        else if (jump < -180) shift += 360
      }
      return lon + shift
    })
    const path = (offset: number) => `M${pts.map(([, lat], k) => project(lons[k] + offset, lat)).join('L')}Z`
    const min = Math.min(...lons)
    const max = Math.max(...lons)
    return path(0) + (min < -180 ? path(360) : '') + (max > 180 ? path(-360) : '')
  }
  return t.objects.countries.geometries
    .filter((g) => g.id !== '010' && (g.type === 'Polygon' || g.type === 'MultiPolygon'))
    .map((g) => {
      const polys = (g.type === 'Polygon' ? [g.arcs] : g.arcs) as number[][][]
      return { key: g.id ?? g.properties.name, name: g.properties.name, d: polys.map((rings) => rings.map(ring).join('')).join('') }
    })
}

type Props = {
  /** Map key (see geography.ts mapKey) to a value from 0 to 1, for the fill */
  values: Map<string, number>
  tip: (key: string, name: string) => string | null
  onPick?: (key: string) => void
}

/** A world map shaded by value; countries with none stay plain. */
export function WorldMap({ values, tip, onPick }: Props) {
  const [countries, setCountries] = useState<MapCountry[] | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    loadCountries().then((c) => live && setCountries(c))
    return () => {
      live = false
    }
  }, [])
  const hovered = useMemo(() => countries?.find((c) => c.key === hover) ?? null, [countries, hover])

  if (!countries) return <div className="worldmap" style={{ aspectRatio: `${W} / ${H}` }} />
  return (
    <div className="worldmap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of your opponents' countries" onPointerLeave={() => setHover(null)}>
        {countries.map((c) => {
          const v = values.get(c.key)
          return (
            <path
              key={c.key}
              d={c.d}
              className={`worldmap-country ${v !== undefined ? 'has' : ''} ${hover === c.key ? 'on' : ''}`}
              style={v !== undefined ? { fillOpacity: 0.25 + 0.75 * v } : undefined}
              onPointerEnter={() => setHover(c.key)}
              onClick={() => v !== undefined && onPick?.(c.key)}
            />
          )
        })}
      </svg>
      <p className="worldmap-tip" aria-live="polite">
        {hovered ? (tip(hovered.key, hovered.name) ?? hovered.name) : ' '}
      </p>
    </div>
  )
}
