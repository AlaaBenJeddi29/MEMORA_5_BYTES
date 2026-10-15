import { Link } from 'react-router-dom'

import logoUrl from '../assets/logo.svg'

export function Brand({ to = '/', name = 'MEMORA' }: { to?: string; name?: string }) {
  return (
    <Link className="brand" to={to}>
      <img className="brand__mark" src={logoUrl} alt="" width={28} height={28} />
      <span className="brand__name">{name}</span>
    </Link>
  )
}
