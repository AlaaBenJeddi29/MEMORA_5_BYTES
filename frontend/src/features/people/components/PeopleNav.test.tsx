import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PeopleNav } from './PeopleNav'

function breadcrumb() {
  return screen.getByRole('navigation', { name: 'Fil d’Ariane' })
}

function tabs() {
  return screen.getByRole('navigation', { name: 'Sections du module Personnes' })
}

describe('PeopleNav', () => {
  it('shows Photos in the breadcrumb and tabs', () => {
    render(
      <MemoryRouter>
        <PeopleNav section="photos" />
      </MemoryRouter>,
    )

    const crumb = within(breadcrumb()).getByText('Mes photos')
    expect(crumb.getAttribute('aria-current')).toBe('page')

    const tab = within(tabs()).getByRole('link', { name: 'Mes photos' })
    expect(tab.getAttribute('href')).toBe('/app/people/photos')
    expect(tab.getAttribute('aria-current')).toBe('page')

    expect(
      within(breadcrumb()).getByRole('link', { name: 'Personnes' }).getAttribute('href'),
    ).toBe('/app/people')
  })

  it('links back to Photos and shows the current photo', () => {
    render(
      <MemoryRouter>
        <PeopleNav section="photos" currentLabel="Photo #7" />
      </MemoryRouter>,
    )

    expect(
      within(breadcrumb()).getByRole('link', { name: 'Mes photos' }).getAttribute('href'),
    ).toBe('/app/people/photos')
    expect(
      within(breadcrumb()).getByText('Photo #7').getAttribute('aria-current'),
    ).toBe('page')
  })

  it('shows the person name under the Personnes section', () => {
    render(
      <MemoryRouter>
        <PeopleNav section="people" currentLabel="Alice" />
      </MemoryRouter>,
    )

    expect(
      within(breadcrumb()).getByRole('link', { name: 'Personnes' }).getAttribute('href'),
    ).toBe('/app/people')
    expect(within(breadcrumb()).getByText('Alice').getAttribute('aria-current')).toBe('page')

    const tab = within(tabs()).getByRole('link', { name: 'Personnes' })
    expect(tab.getAttribute('aria-current')).toBe('page')
  })
})
