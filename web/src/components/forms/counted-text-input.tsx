import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput'
import type { CSSProperties } from 'react'
import { savedLength } from './saved-text'
import './forms.css'

// A TextInput with a "12/100" counter at the end of its label row — the one-line twin
// of TextArea's built-in counter (which TextArea shows when given maxLength). Astryx's
// TextInput has no counter of its own. Red once past the limit; the form decides
// whether that blocks saving. The label row keeps room for the counter at its widest
// ("35/35"), so a long label ("First name · Optional") in a narrow column wraps instead of
// running into it.
export function CountedTextInput({ maxLength, ...props }: TextInputProps & { maxLength: number }) {
  // Counts what will be saved (ends trimmed, spaces collapsed), as the form's check does
  const count = savedLength(props.value ?? '')
  const widest = `${maxLength}/${maxLength}`.length
  return (
    <div className="mm-counted" style={{ '--mm-counter-ch': widest } as CSSProperties}>
      <TextInput {...props} />
      <span className="mm-counter" data-over={count > maxLength || undefined} aria-hidden>
        {count}/{maxLength}
      </span>
    </div>
  )
}
