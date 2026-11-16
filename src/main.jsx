import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// TEMPORARY -- remove this whole component and its <TestingNoticeBanner />
// usage below once testing wraps up. Deliberately kept in this one small
// file (rather than inside App.jsx) so it shows on every screen regardless
// of which of App's internal early-return states is active, and so removing
// it later is a two-line edit in one place.
// Bump the version in BANNER_KEY to bring the banner back for everyone who has closed it.
const BANNER_KEY = 'paxo_banner_v1'

function bannerClosed() {
  try {
    return window.localStorage.getItem(BANNER_KEY) === '1'
  } catch {
    return false // storage blocked: the banner simply shows again
  }
}

function TestingNoticeBanner() {
  const [dismissed, setDismissed] = useState(bannerClosed)
  if (dismissed) return null
  const close = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(BANNER_KEY, '1')
    } catch {
      /* storage blocked: it will show again next visit */
    }
  }
  return (
    <div className="bg-amber/15 border-b border-amber/30 text-amber text-sm px-4 py-1 flex items-center justify-center gap-2 text-center whitespace-nowrap">
      <span>PAXO is in early access.</span>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="text-amber/70 hover:text-amber text-base leading-none shrink-0 px-1"
      >
        ×
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TestingNoticeBanner />
    <App />
  </React.StrictMode>,
)
