import { Link } from 'react-router-dom'

import '../people.css'

type PeopleSection = 'people' | 'photos'

const SECTIONS: ReadonlyArray<{ key: PeopleSection; to: string; label: string }> = [
  { key: 'people', to: '/app/people', label: 'Personnes' },
  { key: 'photos', to: '/app/people/photos', label: 'Mes photos' },
]

export type PeopleNavProps = {
  section: PeopleSection
  /** Optional nested page label appended to the breadcrumb. */
  currentLabel?: string
}

/** Breadcrumb and compact section navigation shared by the People pages. */
export function PeopleNav({ section, currentLabel }: PeopleNavProps) {
  const photosSection = section === 'photos'

  return (
    <div className="people-nav">
      <nav aria-label="Fil d’Ariane">
        <ol className="people-nav__breadcrumb">
          <li>
            {photosSection || currentLabel ? (
              <Link to="/app/people">Personnes</Link>
            ) : (
              <span aria-current="page">Personnes</span>
            )}
          </li>
          {photosSection && (
            <li>
              {currentLabel ? (
                <Link to="/app/people/photos">Mes photos</Link>
              ) : (
                <span aria-current="page">Mes photos</span>
              )}
            </li>
          )}
          {currentLabel && (
            <li>
              <span aria-current="page">{currentLabel}</span>
            </li>
          )}
        </ol>
      </nav>

      <nav aria-label="Sections du module Personnes">
        <ul className="people-nav__tabs">
          {SECTIONS.map((item) => {
            const active = item.key === section
            return (
              <li key={item.key}>
                <Link
                  to={item.to}
                  className={
                    active ? 'people-nav__tab people-nav__tab--active' : 'people-nav__tab'
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
