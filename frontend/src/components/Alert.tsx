import type { ReactNode } from 'react'

type AlertVariant = 'info' | 'error' | 'success' | 'warning'

export type AlertProps = {
  variant?: AlertVariant
  /** Optional bold heading shown above the message. */
  title?: string
  children: ReactNode
}

export function Alert({ variant = 'info', title, children }: AlertProps) {
  const role = variant === 'error' ? 'alert' : 'status'

  return (
    <div className={`alert alert--${variant}`} role={role}>
      {title && <p className="alert__title">{title}</p>}
      {children}
    </div>
  )
}
