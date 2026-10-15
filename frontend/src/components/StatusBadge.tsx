import type { ReactNode } from 'react'

export type StatusBadgeStatus = 'neutral' | 'pending' | 'processing' | 'succeeded' | 'failed'

const DEFAULT_LABELS: Record<StatusBadgeStatus, string> = {
  neutral: 'Unavailable',
  pending: 'Pending',
  processing: 'Processing',
  succeeded: 'Succeeded',
  failed: 'Failed',
}

export type StatusBadgeProps = {
  status?: StatusBadgeStatus
  /** Overrides the default label text. */
  children?: ReactNode
}

/** A small, text-bearing status pill. Uses the API-contract status vocabulary. */
export function StatusBadge({ status = 'neutral', children }: StatusBadgeProps) {
  return <span className={`badge badge--${status}`}>{children ?? DEFAULT_LABELS[status]}</span>
}
