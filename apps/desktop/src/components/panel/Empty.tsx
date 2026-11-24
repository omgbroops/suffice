import type { ReactNode } from 'react'

/** Empty and failed states: two quiet lines in the middle, and at most one way out. */
export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rp-empty">
      <p>{title}</p>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}
