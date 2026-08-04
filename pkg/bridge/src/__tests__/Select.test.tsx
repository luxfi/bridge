// Copyright (C) 2019-2025, Lux Industries, Inc. All rights reserved.
// See the file LICENSE for licensing terms.
//
// Select replaced the native <select> specifically so the asset/chain
// pickers could show a logo + secondary label — but that trade means
// every bit of keyboard behavior a native <select> gets for free
// (arrow-key nav, Home/End, Escape, click-outside-to-dismiss) had to be
// hand-rolled, and none of it had a dedicated test. AssetInput.test.tsx
// exercises Select only incidentally (open + click one option); this
// file covers the interaction contract described in Select.tsx's own
// header comment directly.

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
  render(<Select value={value} options={options} onChange={onChange} />)
  return { onChange }
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: /ETH|SOL|XRP/ }))
}

describe('Select — open/close', () => {
  it('is closed by default and opens on trigger click', () => {
    renderSelect()
    expect(screen.queryByRole('listbox')).toBeNull()
    openPopover()
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toggles closed on a second trigger click', () => {
    renderSelect()
    openPopover()
    expect(screen.getByRole('listbox')).toBeTruthy()
    openPopover()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on a mousedown outside the component, without committing', () => {
    const { onChange } = renderSelect()
    openPopover()
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not close on a mousedown inside the popover', () => {
    renderSelect()
    openPopover()
    fireEvent.mouseDown(screen.getByRole('listbox'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it.each(['ArrowDown', 'Enter', ' '])('opens on %s at the trigger', (key) => {
    renderSelect()
    fireEvent.keyDown(screen.getByRole('button', { name: /ETH/ }), { key })
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('Escape closes the popover and returns focus to the trigger', () => {
    renderSelect()
    const trigger = screen.getByRole('button', { name: /ETH/ })
    openPopover()
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('Select — committing a value', () => {
  it('clicking an option commits it and closes the popover', () => {
    const { onChange } = renderSelect()
    openPopover()
    fireEvent.click(screen.getByRole('option', { name: /SOL/ }))
    expect(onChange).toHaveBeenCalledWith(options[1])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not call onChange when dismissed without a selection', () => {
    const { onChange } = renderSelect()
    openPopover()
    fireEvent.mouseDown(document.body)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Select — keyboard navigation', () => {
  function highlightedId(): string | undefined {
    const opt = screen.getAllByRole('option').find((el) => el.getAttribute('data-highlighted') === 'true')
    return opt?.getAttribute('data-index') ?? undefined
  }

  it('starts highlighted on the currently-selected option', () => {
    renderSelect('sol')
    openPopover()
    expect(highlightedId()).toBe('1') // sol is options[1]
  })

  it('ArrowDown/ArrowUp move the highlight and clamp at the ends', () => {
    renderSelect('eth') // starts at index 0
    openPopover()
    const listbox = screen.getByRole('listbox')

    fireEvent.keyDown(listbox, { key: 'ArrowUp' }) // clamp: stays at 0
    expect(highlightedId()).toBe('0')

    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(highlightedId()).toBe('1')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    expect(highlightedId()).toBe('2')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }) // clamp: stays at last index
    expect(highlightedId()).toBe('2')
  })

  it('Home/End jump to the first/last option', () => {
    renderSelect('sol')
    openPopover()
    const listbox = screen.getByRole('listbox')

    fireEvent.keyDown(listbox, { key: 'End' })
    expect(highlightedId()).toBe('2')
    fireEvent.keyDown(listbox, { key: 'Home' })
    expect(highlightedId()).toBe('0')
  })

  it('Enter commits the highlighted option, not just the selected one', () => {
    const { onChange } = renderSelect('eth')
    openPopover()
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }) // highlight -> sol
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(options[1])
  })

  it('Space also commits the highlighted option', () => {
    const { onChange } = renderSelect('eth')
    openPopover()
    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(options[1])
  })

  it('hovering an option updates the highlight', () => {
    renderSelect('eth')
    openPopover()
    fireEvent.mouseEnter(screen.getByRole('option', { name: /XRP/ }))
    expect(highlightedId()).toBe('2')
  })
})

describe('Select — rendering', () => {
  it('marks the currently-selected option with aria-selected', () => {
    renderSelect('sol')
    openPopover()
    const solOption = screen.getByRole('option', { name: /SOL/ })
    expect(solOption.getAttribute('aria-selected')).toBe('true')
    const ethOption = screen.getByRole('option', { name: /ETH/ })
    expect(ethOption.getAttribute('aria-selected')).toBe('false')
  })

  it('renders the secondary label under the primary one', () => {
    renderSelect()
    openPopover()
    expect(screen.getByText('Ripple')).toBeTruthy()
  })

  it('supports a custom renderTrigger', () => {
    const value = options[0]
    render(
      <Select
        value={value}
        options={options}
        onChange={vi.fn()}
        renderTrigger={(opt) => <span>Custom: {opt.label}</span>}
      />,
    )
    expect(screen.getByText('Custom: ETH')).toBeTruthy()
  })

  it('renders a field label when provided', () => {
    render(<Select label="Asset" value={options[0]} options={options} onChange={vi.fn()} />)
    expect(screen.getByText('Asset')).toBeTruthy()
  })
})
