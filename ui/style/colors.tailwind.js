module.exports = ({ colors }) => ({
  inherit: colors.inherit,
  current: colors.current,
  transparent: colors.transparent,
  input: "var(--lx-input)",
  ring: "var(--lx-ring)",
  background: 'var(--lx-bg-0)',
    // levels forward in z-index (a la Material Design)
  level: {
    DEFAULT: "var(--lx-bg-0)",
    '0': "var(--lx-bg-0)", 
    '1': "var(--lx-bg-1)", 
    '2': "var(--lx-bg-2)", 
    '3': "var(--lx-bg-3)", 
  },
  accent: "var(--lx-fg-0)",      // full contrast (darkTheme:white) : heading and links hover  
  foreground: "var(--lx-fg-body)", // body off-white (bright enough to contrast to bg-level-1)
  muted: {
    DEFAULT: "var(--lx-fg-2)",   // de-emphasized: fine print
    '1': "var(--lx-fg-2)",       // synonymous ^^^ 
    '2': "var(--lx-fg-3)",       // disabled or very de-emphasized
    '3': "var(--lx-fg-4)",       // very disabled ;) 
    '4': "var(--lx-fg-5)",       // disabled border
  }, 
  primary: {
    DEFAULT: "var(--lx-primary)",
    lux: "var(--lx-primary)", // in case there are two configs
    hover: "var(--lx-primary-hover)",
    fg: "var(--lx-primary-fg)",
  },
  secondary: {
    DEFAULT: "var(--lx-secondary)",
    lux: "var(--lx-secondary)", // in case there are two configs
    hover: "var(--lx-secondary-hover)",
    fg: "var(--lx-secondary-fg)",
  },
  destructive: {
    DEFAULT: "var(--lx-destructive)",
    fg: "var(--lx-destructive-fg)",
  },
  nav: {
    DEFAULT: "var(--lx-nav)",
    hover: "var(--lx-nav-hover)",
    current: "var(--lx-nav-current)",
  },
})