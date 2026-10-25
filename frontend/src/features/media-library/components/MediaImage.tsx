import { useEffect, useState } from 'react'

export interface MediaImageProps {
  src: string
  alt: string
  className?: string
  fallbackLabel?: string
  loading?: 'lazy' | 'eager'
}

/** An image that degrades to a labelled placeholder if the file is missing. */
export function MediaImage({
  src,
  alt,
  className,
  fallbackLabel = 'Image unavailable',
  loading = 'lazy',
}: MediaImageProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (failed) {
    return (
      <div
        className={['media-image-fallback', className].filter(Boolean).join(' ')}
        role="img"
        aria-label={alt}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
        <span>{fallbackLabel}</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
    />
  )
}
