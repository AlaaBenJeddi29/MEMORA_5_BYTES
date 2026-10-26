import { forwardRef, useState, type InputHTMLAttributes } from 'react'

import { Icon } from './Icon'

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** A password input with an accessible show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="input-affix">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={['input', className].filter(Boolean).join(' ')}
        {...rest}
      />
      <button
        type="button"
        className="input-affix__button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </div>
  )
})
