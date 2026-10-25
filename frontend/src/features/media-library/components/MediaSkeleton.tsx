export interface MediaSkeletonProps {
  count?: number
}

/** Gallery-shaped loading placeholders with a single screen-reader status. */
export function MediaSkeleton({ count = 8 }: MediaSkeletonProps) {
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Loading your media…
      </p>
      <ul className="media-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li key={index} className="media-card media-skeleton">
            <div className="media-skeleton__block media-skeleton__image" />
            <div className="media-skeleton__body">
              <div className="media-skeleton__block media-skeleton__line media-skeleton__line--short" />
              <div className="media-skeleton__block media-skeleton__line" />
              <div className="media-skeleton__block media-skeleton__line media-skeleton__line--shorter" />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
