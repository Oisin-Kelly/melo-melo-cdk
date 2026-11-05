/** "in 3 days", "in 5 hours", "in under an hour". */
export function expiresIn(expiresAt: number, now = Date.now()): string {
  const hours = (expiresAt - now) / 3_600_000
  if (hours >= 24) {
    const days = Math.round(hours / 24)
    return `in ${days} day${days === 1 ? '' : 's'}`
  }
  if (hours >= 1) {
    const whole = Math.floor(hours)
    return `in ${whole} hour${whole === 1 ? '' : 's'}`
  }
  return 'in under an hour'
}
