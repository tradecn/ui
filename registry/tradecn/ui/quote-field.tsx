import { cn } from "cn"
import { useId, useState, type KeyboardEvent, type RefObject } from "react"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { QUOTE_BASIS_LABELS, formatQuote, parseQuote, quoteBasisOf, stepQuote, type InstrumentConvention } from "@/registry/tradecn/lib/format"

// A field that types a quote the way the instrument quotes it: 99-16+ for a note on price, 4.253
// for a bill on discount, 12.6 for credit on a spread. It parses on every keystroke and hands the
// number up, marks what is not a quote on blur and prints a good one back in the notation, and steps
// by the instrument's own step with the arrows and the two buttons, ten steps with Shift held. With a
// modifier held the arrows are not its business: they belong to whoever listens above it, which is
// how a ticket's mod+up reaches its registry from inside this field.
//
// It is controlled, so the value is the parent's. When the parent moves it (a step from a key, a click
// on a reference price, a reset) the text follows; when the text already reads as the new value, as it
// does while someone is typing, the text is left alone under the cursor.

export interface QuoteFieldProps {
  /** How the quote prints, parses, and steps, and in what basis. */
  convention: InstrumentConvention
  /** The quote, or null while the field is blank or not a quote. */
  value: number | null
  onValueChange: (value: number | null) => void
  /** Where a step starts when the field is blank. Left out, the arrows do nothing on a blank field. */
  stepFrom?: number | null
  /** The label, and the word in the button names. Default: the basis word, Price, Yield, Discount, or Spread. */
  label?: string
  /** A problem your check found with the value, printed under the field. */
  error?: string
  /** Said under the field when the text is not a quote. Default names the basis. */
  invalidText?: string
  /** Default: zero in the notation. */
  placeholder?: string
  id?: string
  disabled?: boolean
  /** What Shift multiplies a step by. Default 10. */
  shiftMultiplier?: number
  /** The side of a two-sided quote this field is, as `data-side` on the root. */
  side?: "bid" | "ask"
  inputRef?: RefObject<HTMLInputElement | null>
  className?: string
}

export function QuoteField({ convention, value, onValueChange, stepFrom = null, label, error, invalidText, placeholder, id: idProp, disabled = false, shiftMultiplier = 10, side, inputRef, className }: QuoteFieldProps) {
  const basis = quoteBasisOf(convention)
  const word = label ?? QUOTE_BASIS_LABELS[basis]
  const generated = useId()
  const id = idProp ?? generated
  const [text, setText] = useState(() => (value === null ? "" : formatQuote(value, convention)))
  const [invalid, setInvalid] = useState(false)

  // Derived state, set during render: the parent moved the value, so the text follows, unless the
  // text already reads as that value (someone is typing it) and would only be reformatted under them.
  const [known, setKnown] = useState(value)
  if (value !== known) {
    setKnown(value)
    if (parseQuote(text, convention) !== value) {
      setText(value === null ? "" : formatQuote(value, convention))
      setInvalid(false)
    }
  }

  function change(next: string) {
    setText(next)
    setInvalid(false)
    onValueChange(parseQuote(next, convention))
  }

  function blur() {
    if (!text.trim()) return setInvalid(false)
    const parsed = parseQuote(text, convention)
    if (parsed === null) return setInvalid(true)
    setText(formatQuote(parsed, convention))
  }

  function step(steps: number) {
    const from = value ?? stepFrom
    if (from === null || from === undefined) return
    const next = stepQuote(from, convention, steps)
    setText(formatQuote(next, convention))
    setInvalid(false)
    onValueChange(next)
  }

  // Bare arrows step. With a modifier held the key belongs to the registry above.
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    step((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? shiftMultiplier : 1))
  }

  const problem = error ?? (invalid ? (invalidText ?? `Not a ${word.toLowerCase()} in this instrument's notation.`) : undefined)

  return (
    <div data-slot="tradecn-quote-field" data-basis={basis} data-side={side} className={cn("block", className)}>
      <Field data-invalid={problem ? true : undefined}>
        <FieldLabel htmlFor={id}>{word}</FieldLabel>
        <InputGroup className="h-7">
          <InputGroupInput
            ref={inputRef}
            id={id}
            value={text}
            placeholder={placeholder ?? formatQuote(0, convention)}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={problem ? true : undefined}
            className="font-mono text-xs md:text-xs"
            onChange={(event) => change(event.target.value)}
            onBlur={blur}
            onKeyDown={keyDown}
          />
          <InputGroupAddon align="inline-end" className="gap-0">
            <InputGroupButton type="button" size="icon-xs" aria-label={`${word} down one tick`} disabled={disabled} data-step="-1" onClick={() => step(-1)}>
              −
            </InputGroupButton>
            <InputGroupButton type="button" size="icon-xs" aria-label={`${word} up one tick`} disabled={disabled} data-step="1" onClick={() => step(1)}>
              +
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {problem && <FieldError>{problem}</FieldError>}
      </Field>
    </div>
  )
}
