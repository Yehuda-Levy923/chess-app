/** "7 Oct 2026" */
export function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
