// tsgo (typescript 7) requires an ambient declaration for side-effect CSS
// imports that TS6 accepted implicitly (TS2882). Covers both this app's own
// imports and the same pattern inside @luxdefi/ui, which ships .tsx sources
// (not a prebuilt dist) so its side-effect imports are part of this program.
declare module "*.css"
