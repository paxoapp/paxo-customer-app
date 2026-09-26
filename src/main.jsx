import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// TEMPORARY -- remove this whole component and its <TestingNoticeBanner />
// usage below once testing wraps up. Deliberately kept in this one small
// file (rather than inside App.jsx) so it shows on every screen regardless
// of which of App's internal early-return states is active, and so removing
// it later is a two-line edit in one place.
function TestingNoticeBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="bg-amber/15 border-b border-amber/30 text-amber text-sm px-4 py-2 flex items-center justify-center gap-3 text-center">
      <span>
        🚧 PAXO is currently under testing — thanks for your patience. The full experience is coming soon!
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber/70 hover:text-amber text-lg leading-none shrink-0"
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
