function finitePoint(point) {
  return point
    && point.value !== null
    && point.value !== undefined
    && Number.isFinite(Number(point.value))
}

export function buildLineChartGeometry(points, width = 640, height = 220, padding = 16) {
  const observations = Array.isArray(points) ? points.filter(finitePoint) : []
  if (!observations.length) {
    return { coordinates: [], path: '', min: null, max: null }
  }

  const values = observations.map(point => Number(point.value))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const usableWidth = Math.max(0, width - padding * 2)
  const usableHeight = Math.max(0, height - padding * 2)

  const coordinates = observations.map((point, index) => {
    const x = observations.length === 1
      ? width / 2
      : padding + (index / (observations.length - 1)) * usableWidth
    const y = range === 0
      ? height / 2
      : padding + ((max - Number(point.value)) / range) * usableHeight
    return { ...point, value: Number(point.value), x, y }
  })
  const path = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
    .replace(/ L /g, ' L ')

  return { coordinates, path, min, max }
}
