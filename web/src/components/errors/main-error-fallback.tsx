// This is the ONE sanctioned exception to the Astryx "no raw <div>, style via
// tokens" rule: the fallback renders OUTSIDE <Theme> (the boundary wraps the
// theme so it also catches theme-setup failures), so Astryx components would
// have no token context here. Deliberately plain HTML + inline styles.
export function MainErrorFallback() {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        minHeight: '100svh',
        fontFamily: 'system-ui, sans-serif',
        color: '#1c1b19',
        background: '#faf9f7',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h1>
      <p style={{ margin: 0, opacity: 0.7 }}>
        The app hit an unexpected error.
      </p>
      <button
        type="button"
        onClick={() => window.location.assign('/')}
        style={{
          marginTop: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: 'none',
          background: '#1c1b19',
          color: '#faf9f7',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  )
}
