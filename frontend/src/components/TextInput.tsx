import { forwardRef, type InputHTMLAttributes } from 'react'

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>

/** A styled native `<input>`. Pair with `<FormField>` for a label and errors. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, type = 'text', ...rest },
  ref,
) {
  return <input ref={ref} type={type} className={['input', className].filter(Boolean).join(' ')} {...rest} />
})
