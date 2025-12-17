export function toDMY(date: string) {
  if (!date) return ""
  const [y, m, d] = date.split("-")
  return `${d}/${m}/${y}`
}
