export type LoadingStateProps = {
  label?: string
  /** Centers the indicator in a tall area, e.g. while a route loads. */
  centered?: boolean
}

/** An accessible "busy" indicator announced to assistive technology. */
export function LoadingState({ label = 'Loading…', centered = false }: LoadingStateProps) {
  return (
    <div
      className={centered ? 'loading-state loading-state--centered' : 'loading-state'}
      role="status"
      aria-live="polite"
    >
      <svg className="spinner" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span>{label}</span>
    </div>
  )
}
