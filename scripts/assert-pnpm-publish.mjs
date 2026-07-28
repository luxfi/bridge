// Refuse to publish under npm.
//
// Packages in this workspace declare `workspace:*` dependencies (pkg/bridge
// depends on @luxfi/threshold that way). Only `pnpm publish` rewrites that
// specifier to a real version on the way out. `npm publish` ships it verbatim,
// and every consumer then fails at install with:
//
//   ERR_PNPM_WORKSPACE_PKG_NOT_FOUND  "@luxfi/threshold@workspace:*" is in the
//   dependencies but no package named "@luxfi/threshold" is present in the workspace
//
// That is exactly how @luxfi/bridge@1.0.7 shipped broken. The mistake is
// invisible in CI and inside the monorepo — only an external consumer ever
// sees it — so the check has to happen at publish time, and has to fail closed.

const ua = process.env.npm_config_user_agent ?? '';

if (!/\bpnpm\//.test(ua)) {
  console.error(`
  Refusing to publish: this package has workspace:* dependencies.

  Only \`pnpm publish\` rewrites them to real versions. \`npm publish\` ships
  them verbatim and no consumer can install the result — see
  @luxfi/bridge@1.0.7, which is broken on npm for this exact reason.

  Use:  pnpm publish --access public

  (detected user agent: ${ua || '<none>'})
`);
  process.exit(1);
}
