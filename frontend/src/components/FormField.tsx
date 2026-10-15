import { useId, type ReactNode } from 'react'

/** ARIA props the field wires onto its input, so the label/error stay associated. */
export interface FormFieldRenderProps {
  id: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export interface FormFieldProps {
  label: string
  /** Provide to control the input id; otherwise one is generated. */
  id?: string
  hint?: string
  error?: string
  required?: boolean
  /**
   * Render prop receiving the id and ARIA attributes to spread onto the input,
   * e.g. `{(field) => <TextInput {...field} name="email" />}`.
   */
  children: (field: FormFieldRenderProps) => ReactNode
}

/**
 * Wraps a single input with a label, optional hint, and error message. The
 * label is always associated with the input, and errors are described by and
 * announced from the field.
 */
export function FormField({ label, id, hint, error, required = false, children }: FormFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
        {required && (
          <>
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>

      {hint && (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      )}

      {children({
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}

      {error && (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
