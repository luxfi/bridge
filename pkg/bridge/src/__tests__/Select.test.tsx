// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// Select replaced the native <select> so the chain and asset pickers could
// show a logo and a secondary line — and that trade means every bit of
// keyboard behaviour a native control gets for free had to be written out.
// This file is where that behaviour is held to its word.
//
// Two things it pins that the earlier version did not. Every key is answered
// on the trigger, because the menu was never focused and the arrows were
// therefore dead after opening with Enter. And the control carries a name:
// `label` draws one, `name` reads one, and there is no third way to render a
// picker whose only name is the value it happens to be holding.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Select, type SelectOption } from '../app/components/Select'

const options: SelectOption[] = [
  { id: 'eth', label: 'ETH', secondary: 'Ethereum' },
  { id: 'sol', label: 'SOL', secondary: 'Solana' },
  { id: 'xrp', label: 'XRP', secondary: 'Ripple' },
]

function renderSelect(valueId = 'eth') {
  const onChange = vi.fn()
  const value = options.find((o) => o.id === valueId)!
  render(<Select name="Asset" value={value} options={options} onChange={onChange} />)
  return { onChange }
}

const trigger = () => screen.getByRole('combobox')

function open() {
  fireEvent.click(trigger())
}

describe('Select — open/close', () => {
  it('is closed by default and opens on trigger click', () => {
    renderSelect()
    expect(screen.queryByRole('listbox')).toBeNull()
    open()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toggles closed on a second trigger click', () => {
    renderSelect()
    open()
    expect(screen.getByRole('listbox')).toBeTruthy()
    open()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on a mousedown outside the component, without committing', () => {
    const { onChange } = renderSelect()
    open()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not close on a mousedown inside the popover', () => {
    renderSelect()
    open()
    fireEvent.mouseDown(screen.getByRole('listbox'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it.each(['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'])(
    'opens on %s at the trigger',
    (key) => {
      renderSelect()
      fireEvent.keyDown(trigger(), { key })
      expect(screen.getByRole('listbox')).toBeTruthy()
    },
  )

  it('Escape closes the popover, and the trigger still holds focus', () => {
    renderSelect()
    trigger().focus()
    open()
    fireEvent.keyDown(trigger(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('answers Escape only while open, so a closed picker leaves it to the page', () => {
    renderSelect()
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    trigger().dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

describe('Select — committing a value', () => {
  it('pressing an option commits it and closes the popover', () => {
    const { onChange } = renderSelect()
    open()
    fireEvent.mouseDown(screen.getByRole('option', { name: /SOL/ }))
    expect(onChange).toHaveBeenCalledWith(options[1])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not call onChange when dismissed without a selection', () => {
    const { onChange } = renderSelect()
    open()
    fireEvent.mouseDown(document.body)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('returns focus to the trigger after a commit', () => {
    renderSelect()
    trigger().focus()
    open()
    fireEvent.mouseDown(screen.getByRole('option', { name: /SOL/ }))
    expect(document.activeElement).toBe(trigger())
  })
})

describe('Select — keyboard navigation', () => {
  function cursor(): string | undefined {
    return screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('data-highlighted') === 'true')
      ?.getAttribute('data-index') ?? undefined
  }

  it('starts on the currently-selected option', () => {
    renderSelect('sol')
    open()
    expect(cursor()).toBe('1')
  })

  it('ArrowDown/ArrowUp move the cursor and clamp at the ends', () => {
    renderSelect('eth')
    open()
    fireEvent.keyDown(trigger(), { key: 'ArrowUp' })
    expect(cursor()).toBe('0')
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(cursor()).toBe('1')
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(cursor()).toBe('2')
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(cursor()).toBe('2')
  })

  it('Home/End jump to the first/last option', () => {
    renderSelect('sol')
    open()
    fireEvent.keyDown(trigger(), { key: 'End' })
    expect(cursor()).toBe('2')
    fireEvent.keyDown(trigger(), { key: 'Home' })
    expect(cursor()).toBe('0')
  })

  it('Enter commits where the cursor is, not where the value was', () => {
    const { onChange } = renderSelect('eth')
    open()
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(trigger(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(options[1])
  })

  it('Space also commits where the cursor is', () => {
    const { onChange } = renderSelect('eth')
    open()
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(trigger(), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(options[1])
  })

  it('reaches every option from the keyboard alone — open, walk, commit', () => {
    const { onChange } = renderSelect('eth')
    fireEvent.keyDown(trigger(), { key: 'Enter' })
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(trigger(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(options[2])
  })

  it('hovering an option moves the cursor', () => {
    renderSelect('eth')
    open()
    fireEvent.mouseEnter(screen.getByRole('option', { name: /XRP/ }))
    expect(cursor()).toBe('2')
  })

  it('names the option under the cursor, so the reading follows the arrows', () => {
    renderSelect('eth')
    open()
    const on = () => trigger().getAttribute('aria-activedescendant')
    const first = on()
    expect(first).toBe(screen.getAllByRole('option')[0]!.id)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(on()).toBe(screen.getAllByRole('option')[1]!.id)
  })
})

describe('Select — the control has a name', () => {
  it('a drawn label names the control and points at it', () => {
    render(<Select label="From" value={options[0]} options={options} onChange={vi.fn()} />)
    const control = screen.getByRole('combobox', { name: /From/ })
    const label = screen.getByText('From')
    expect(label.getAttribute('for')).toBe(control.id)
  })

  it('a name reads without drawing a second word on screen', () => {
    render(<Select name="You send asset" value={options[0]} options={options} onChange={vi.fn()} />)
    expect(screen.getByRole('combobox', { name: 'You send asset' })).toBeTruthy()
    expect(screen.queryByText('You send asset')).toBeNull()
  })

  it('the name survives a custom trigger body', () => {
    render(
      <Select
        name="You receive asset"
        value={options[0]}
        options={options}
        onChange={vi.fn()}
        renderTrigger={(opt) => <span>Custom: {opt.label}</span>}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'You receive asset' })).toBeTruthy()
    expect(screen.getByText('Custom: ETH')).toBeTruthy()
  })
})

describe('Select — rendering', () => {
  it('marks the currently-selected option with aria-selected', () => {
    renderSelect('sol')
    open()
    expect(screen.getByRole('option', { name: /SOL/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: /ETH/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('renders the secondary label under the primary one', () => {
    renderSelect()
    open()
    expect(screen.getByText('Ripple')).toBeTruthy()
  })

  it('puts one tab stop on the whole picker, not one per option', () => {
    renderSelect()
    open()
    const stops = document.querySelectorAll('[tabindex]:not([tabindex="-1"]), button, a[href], input')
    expect(stops.length).toBe(1)
    expect(stops[0]).toBe(trigger())
  })
})
