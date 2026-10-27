import type { ReactNode } from 'react'

/**
 * MEMORA's inline icon set. Hand-drawn on a 24px grid with a single stroke
 * weight so the whole product shares one line language without pulling in an
 * icon dependency.
 */
export type IconName =
  | 'alert'
  | 'arrowLeft'
  | 'arrowRight'
  | 'arrowUpRight'
  | 'book'
  | 'calendar'
  | 'camera'
  | 'check'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'clock'
  | 'close'
  | 'compass'
  | 'download'
  | 'edit'
  | 'external'
  | 'eye'
  | 'eyeOff'
  | 'filter'
  | 'folder'
  | 'grid'
  | 'heart'
  | 'home'
  | 'image'
  | 'info'
  | 'leaf'
  | 'list'
  | 'lock'
  | 'logout'
  | 'mail'
  | 'menu'
  | 'mic'
  | 'moon'
  | 'pause'
  | 'pen'
  | 'play'
  | 'plus'
  | 'quote'
  | 'refresh'
  | 'repeat'
  | 'search'
  | 'send'
  | 'shield'
  | 'sparkles'
  | 'star'
  | 'stop'
  | 'sun'
  | 'tag'
  | 'trash'
  | 'universalAccess'
  | 'upload'
  | 'user'
  | 'users'
  | 'volume'
  | 'wave'

const PATHS: Record<IconName, ReactNode> = {
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4z" />
      <path d="M12 9v5M12 17.2v.2" />
    </>
  ),
  arrowLeft: <path d="M20 12H4M10 6l-6 6 6 6" />,
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
  book: (
    <>
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20" />
      <path d="M9 7h7M9 10.5h5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m13 7 4 4" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-2.7 3.5M6.4 6.9A16 16 0 0 0 2.5 12S6 18.1 12 18.1a9.6 9.6 0 0 0 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  filter: <path d="M4 5h16l-6.2 7.4V19l-3.6 2v-8.6z" />,
  folder: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" />
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.3-7.5-9.5A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 3.1C19.5 15.7 12 20 12 20z" />
  ),
  home: (
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4C10 4 4 8.5 4 15a5 5 0 0 0 5 5c6.5 0 11-6 11-16z" />
      <path d="M4 21c2-6 6-9 12-11" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H5v16h4" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  pen: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  quote: (
    <>
      <path d="M9.5 6.5C6.5 8 5 10.4 5 13.5c0 2.4 1.2 4 3.2 4 1.7 0 2.9-1.2 2.9-2.8 0-1.5-1-2.7-2.5-2.7-.3 0-.6 0-.8.1.3-1.7 1.3-2.9 3-3.8z" />
      <path d="M19 6.5c-3 1.5-4.5 3.9-4.5 7 0 2.4 1.2 4 3.2 4 1.7 0 2.9-1.2 2.9-2.8 0-1.5-1-2.7-2.5-2.7-.3 0-.6 0-.8.1.3-1.7 1.3-2.9 3-3.8z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 2.5 20.5 6 17 9.5" />
      <path d="M3.5 11V9A3 3 0 0 1 6.5 6h14" />
      <path d="m7 21.5-3.5-3.5L7 14.5" />
      <path d="M20.5 13v2a3 3 0 0 1-3 3h-14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  send: (
    <>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v5.5c0 4.6-3.2 8-8 9.5-4.8-1.5-8-4.9-8-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
      <path d="M5 15l.6 1.6L7 17.2l-1.4.6L5 19.4l-.6-1.6L3 17.2l1.4-.6z" />
    </>
  ),
  star: (
    <path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z" />
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  tag: (
    <>
      <path d="M12.5 3H21v8.5L11 21.5 2.5 13z" />
      <circle cx="16.8" cy="7.2" r="1.3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  universalAccess: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="7.5" r="1.5" />
      <path d="M6.6 10.2c1.8.6 3.6.9 5.4.9s3.6-.3 5.4-.9" />
      <path d="M12 11.1v3.2M12 14.3l-2.1 4M12 14.3l2.1 4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.6A5 5 0 0 1 20.5 19" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h4L13 5v14l-5-4.5H4z" />
      <path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  wave: <path d="M3 12h1.5M6.5 8v8M10 4.5v15M13.5 7v10M17 5v14M20.5 9.5v5" />,
}

export interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}

export function Icon({ name, size = 20, strokeWidth = 1.7, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
