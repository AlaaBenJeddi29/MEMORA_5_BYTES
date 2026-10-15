import { useEffect } from 'react'

/** Sets the document title for the lifetime of the calling component. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    return () => {
      document.title = previousTitle
    }
  }, [title])
}
