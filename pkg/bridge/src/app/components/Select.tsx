// Custom popover-style Select.
//
// Replaces native <select> with a controllable trigger + popover menu so
// each option can carry a logo and secondary text (e.g. asset name under
// symbol). The native <select> couldn't render either, which is why the
// chain/asset pickers used to look out of place vs the rest of the chrome.
//
// Behavior: click-outside closes, Escape closes, ↑/↓ moves the highlight,
// Enter / Space commits the highlighted item. Click anywhere outside the
// trigger or popover dismisses without committing.
//
// No portal dependency — the popover anchors directly below the trigger
// via absolute positioning. This keeps the SDK free of @hanzogui/portal
// for now; if a host page clips the popover with overflow:hidden we can
// re-introduce a portal at that point.

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

export interface SelectProps {
  /** Field label, rendered above the trigger. */
  label?: string
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
  gap: 6,
  minWidth: 0,
  flex: 1,
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: 'var(--bridge-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
}

const trigger: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'var(--bridge-bg-input)',
  border: '1px solid var(--bridge-border)',
  borderRadius: 'var(--bridge-radius-md)',
  color: 'var(--bridge-text)',
  padding: '10px 12px',
  fontSize: 14,
  fontWeight: 500,
  outline: 'none',
  width: '100%',
  cursor: 'pointer',
  transition: 'background-color var(--bridge-transition-fast), border-color var(--bridge-transition-fast)',
}

const triggerOpen: CSSProperties = {
  background: 'var(--bridge-bg-hover)',
  borderColor: 'var(--bridge-border-focus)',
  boxShadow: '0 0 0 3px var(--bridge-accent-soft)',
}

const caret: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  color: 'var(--bridge-text-muted)',
  transition: 'transform var(--bridge-transition-fast)',
}

const popover: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  right: 0,
  zIndex: 50,
}

const itemSecondary: CSSProperties = {
  fontSize: 11,
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
    <span
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {option.label}
    </span>
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
          alt={fallback}
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

export const Select: FC<SelectProps> = ({
  label,
  value,
  options,
  onChange,
  style,
  renderTrigger,
}) => {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.id === value.id)),
  )
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listboxId = useId()

  // Sync highlight when value changes externally.
  useEffect(() => {
    const idx = options.findIndex((o) => o.id === value.id)
    if (idx >= 0) setHighlight(idx)
  }, [value.id, options])

  // Click-outside to dismiss.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Auto-scroll highlighted item into view.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return
    const el = popoverRef.current.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    )
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const commit = useCallback(
    (idx: number) => {
      const opt = options[idx]
      if (!opt) return
      onChange(opt)
      setOpen(false)
      // Return focus to trigger after commit for keyboard users.
      triggerRef.current?.focus()
    },
    [options, onChange],
  )

  const onTriggerKey = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
    },
    [],
  )

  const onListKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(options.length - 1, h + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(0, h - 1))
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setHighlight(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setHighlight(options.length - 1)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        commit(highlight)
      }
    },
    [options.length, highlight, commit],
  )

  const triggerStyle: CSSProperties = open
    ? { ...trigger, ...triggerOpen }
    : trigger
  const caretStyle: CSSProperties = open
    ? { ...caret, transform: 'rotate(180deg)' }
    : caret

  return (
    <div ref={wrapRef} style={{ ...wrap, ...style }}>
      {label ? <span style={labelStyle}>{label}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        style={triggerStyle}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
      >
        {renderTrigger ? renderTrigger(value) : <DefaultTrigger option={value} />}
        <span style={caretStyle} aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          className="bridge-popover"
          style={popover}
          role="listbox"
          id={listboxId}
          tabIndex={-1}
          onKeyDown={onListKey}
        >
          {options.map((opt, i) => {
            const selected = opt.id === value.id
            const highlighted = i === highlight
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                className="bridge-popover-item"
                data-index={i}
                data-selected={selected ? 'true' : 'false'}
                data-highlighted={highlighted ? 'true' : 'false'}
                aria-selected={selected}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(i)}
              >
                <Logo url={opt.logoUrl} fallback={opt.label} />
                <div style={itemPrimaryRow}>
                  <span>{opt.label}</span>
                  {opt.secondary ? (
                    <span style={itemSecondary}>{opt.secondary}</span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
