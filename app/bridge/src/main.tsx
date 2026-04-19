import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { fetchTenant } from '@/lib/tenant'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('root element missing')

// Kick off tenant fetch — components use getTenant() to read the cached value.
// Fire-and-forget; UI renders immediately with the fallback and updates when
// the IAM response arrives (components are expected to subscribe via a hook
// or re-render naturally). For now we just prefetch.
void fetchTenant().then((t) => {
  document.title = t.name || document.title
  if (t.faviconUrl) {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (link) link.href = t.faviconUrl
  }
  document.documentElement.style.setProperty('--brand-primary', t.primaryColor)
})

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
