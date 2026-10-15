export function SkipLink({ targetId = 'main' }: { targetId?: string }) {
  return (
    <a className="skip-link" href={`#${targetId}`}>
      Skip to main content
    </a>
  )
}
