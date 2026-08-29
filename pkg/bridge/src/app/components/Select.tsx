// A picker over a named set — a chain, an asset.
//
// Replaces native <select> so each option can carry a logo and a secondary
// line (an asset's name under its symbol, a chain's family under its name).
// The native control renders neither, which is why the pickers used to look
// pasted onto the rest of the card.
//
// Keyboard, and why it is all on the trigger. The menu used to hold the key
// handler, and nothing ever focused the menu — so opening with Enter left the
// arrows dead and the only way through the list was a mouse. The trigger keeps
// focus for the whole interaction and `aria-activedescendant` says which option
// the keyboard is on, which is the combobox pattern and the reason there is one
// handler here rather than two that can disagree.
//
// The label names the control. `label` renders a <label> that points at the
// trigger's own id, so a screen reader reads "From, Lux" rather than "Lux" —
// and where a field's name is already carried by the layout (the asset picker
// sits inside a row the amount input already names), `name` supplies it without
// drawing a second word on screen. One of the two is required, which is what
// makes a nameless picker unspellable rather than merely discouraged.
//
// No portal. The menu anchors below the trigger with absolute positioning; if
// a host page ever clips it with overflow:hidden that is when a portal earns
// its dependency.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export interface SelectOption {
  /** Stable id for the option. */
  id: string
  /** Primary label shown in trigger + menu. */
  label: string
  /** Optional secondary label rendered under primary in the menu. */
  secondary?: string
  /** Optional brand mark URL (data URL or http(s)). */
  logoUrl?: string
}

/**
 * What this picker is for, said once. Either it is drawn above the control
 * (`label`) or it is read out without being drawn (`name`) — never neither,
 * which is the shape of the rule rather than a comment asking for it.
 */
type Named =
  | { label: ReactNode; name?: never }
  | { name: string; label?: never }

export type SelectProps = Named & {
  /** Currently-selected option. */
  value: SelectOption
  /** Full option set. */
  options: SelectOption[]
  /** Commit callback — fires on user pick. */
  onChange: (option: SelectOption) => void
  /** Optional inline style on the wrapper. */
  style?: CSSProperties
  /** Optional render-prop for the trigger body. Defaults to logo + label. */
  renderTrigger?: (option: SelectOption) => ReactNode
}

const wrap: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  flex: 1,
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--bridge-label-size)',
  color: 'var(--bridge-text-muted)',
  fontWeight: 500,
  cursor: 'pointer',
  lineHeight: '20px',
}

const triggerText: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const popover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 50,
}

const itemSecondary: CSSProperties = {
  fontSize: 'var(--bridge-note-size)',
  color: 'var(--bridge-text-muted)',
  fontWeight: 400,
}

const itemPrimaryRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
}

/** Default trigger body — logo bubble + primary label. */
const DefaultTrigger: FC<{ option: SelectOption }> = ({ option }) => (
  <>
    <Logo url={option.logoUrl} fallback={option.label} />
    <span style={triggerText}>{option.label}</span>
  </>
)

/**
 * Small logo bubble — renders an <img> if a URL is provided, else (or after
 * load failure) the first character of `fallback` inside the bubble. The
 * useState'd error flag lets us swap the broken-image placeholder for a
 * readable letter avatar without a layout shift.
 *
 * useMemo keys the error state on the URL so a fresh URL (e.g. when the
 * registry hydrates from the API) resets the failure state automatically.
 */
export const Logo: FC<{
  url?: string
  fallback: string
  size?: 'sm' | 'md' | 'lg'
}> = ({ url, fallback, size = 'md' }) => {
  const cls = useMemo(
    () =>
      size === 'sm'
        ? 'bridge-logo bridge-logo-sm'
        : size === 'lg'
          ? 'bridge-logo bridge-logo-lg'
          : 'bridge-logo',
    [size],
  )
  const [failed, setFailed] = useState(false)
  // Reset failure state whenever the URL changes — a new URL deserves a
  // fresh shot at loading even if the previous one failed.
  useEffect(() => {
    setFailed(false)
  }, [url])

  if (url && !failed) {
    return (
      <span className={cls}>
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }
  return (
    <span className={cls} aria-hidden>
      {fallback.charAt(0).toUpperCase()}
    </span>
  )
}

/** Where an arrow key lands, or null for a key this control does not own. */
function moved(key: string, at: number, of: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return Math.min(of - 1, at + 1)
    case 'ArrowUp':
      return Math.max(0, at - 1)
    case 'Home':
      return 0
    case 'End':
      return of - 1
    default:
      return null
  }
}

export const Select: FC<SelectProps> = ({
  label,
  name,
  value,
  options,
  onChange,
  style,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.id === value.id)),
  )
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const own = useId()
  const listId = `${own}-list`
  const labelId = `${own}-label`
  const optionId = (i: number) => `${own}-opt-${i}`

  // Sync the cursor when the value changes externally.
  useEffect(() => {
    const i = options.findIndex((o) => o.id === value.id)
    if (i >= 0) setAt(i)
  }, [value.id, options])

  // Click-outside to dismiss.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Keep the option the keyboard is on inside the scroll window.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return
    popoverRef.current
      .querySelector<HTMLElement>(`[data-index="${at}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [at, open])

  const commit = useCallback(
    (i: number) => {
      const opt = options[i]
      if (!opt) return
      onChange(opt)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [options, onChange],
  )

  // Every key this control answers for, in one place, on the element that
  // holds focus for the whole interaction.
  const onKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') {
        if (!open) return
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (open) commit(at)
        else setOpen(true)
        return
      }
      const to = moved(e.key, at, options.length)
      if (to === null) return
      e.preventDefault()
      setAt(to)
      setOpen(true)
    },
    [open, at, options.length, commit],
  )

  return (
    <div ref={wrapRef} style={{ ...wrap, ...style }}>
      {label ? (
        <label id={labelId} htmlFor={own} style={labelStyle}>
          {label}
        </label>
      ) : null}
      <button
        ref={triggerRef}
        id={own}
        type="button"
        className="bridge-select-trigger"
        data-open={open ? 'true' : 'false'}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(at) : undefined}
        {...(label ? { 'aria-labelledby': `${labelId} ${own}` } : { 'aria-label': name })}
      >
        {renderTrigger ? renderTrigger(value) : <DefaultTrigger option={value} />}
        <span className="bridge-select-caret" aria-hidden />
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="bridge-popover"
          style={popover}
          role="listbox"
          id={listId}
          aria-label={typeof label === 'string' ? label : name}
        >
          {options.map((opt, i) => {
            const selected = opt.id === value.id
            return (
              /*
               * A div, not a button. An option inside a listbox is reached by
               * the arrows on the trigger, and a button inside it puts a
               * second tab stop on every row of a list that can be forty long.
               * Pointer users still click it; `onMouseDown` rather than
               * `onClick` so the commit happens before the click-outside
               * listener sees the press.
               */
              <div
                key={opt.id}
                id={optionId(i)}
                role="option"
                className="bridge-popover-item"
                data-index={i}
                data-selected={selected ? 'true' : 'false'}
                data-highlighted={i === at ? 'true' : 'false'}
                aria-selected={selected}
                onMouseEnter={() => setAt(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  commit(i)
                }}
              >
                <Logo url={opt.logoUrl} fallback={opt.label} />
                <div style={itemPrimaryRow}>
                  <span>{opt.label}</span>
                  {opt.secondary ? (
                    <span style={itemSecondary}>{opt.secondary}</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
