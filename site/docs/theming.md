# Theming

tradecn reads shadcn's palette and adds the tokens a trading screen needs on top of it.

## Tokens

Components, hooks and utilities add the tokens their files use to your stylesheet in `:root` and `.dark`. They preserve existing values, so you can set `--up` and `--down` before installing another item. Themes have different overwrite behavior, described below. See rule 7 of [the item contract](contract.md).

The default light marks come from `tradecn-slate`; dark marks are tuned for shadcn's near-black surfaces. Tests check contrast for specified text and mark pairs on the supplied surfaces. If you change a surface or token, check the resulting contrast in your application.

{{tokens}}

## Themes

Themes replace the shadcn palette, radius and every tradecn token, including the font stacks. They add CSS variables and typography rules without component or font files. Review a theme with `--diff` before installing it.

Each theme provides light and dark values, switched by your `dark` class. This site defaults to `tradecn-amber`, with blue for up and vermilion for down. Items installed without a theme use green for up. Choose the direction convention your application needs; color alone must not carry meaning.

{{themes}}

[Color](color.md) explains the contrast checks, non-color cues and limitations of the simulated color-vision previews. Those previews are not a guarantee that every user can distinguish a pair.

## Typography

Set `--tradecn-font-sans`, `--tradecn-font-mono` and `--tradecn-font-numeric` to choose font stacks for tradecn components. The table above lists the tokens installed by individual items. [Typography](typography.md) includes the full token reference, font loading, sizes, weights and setup for `data-accessibility="hyperlegible"`.

Load the fonts yourself; setting a token doesn't download a font. Numeric nodes must request `font-variant-numeric: lining-nums tabular-nums`, which the installed-style browser checks verify. When replacing a font, check that it supplies those features.

## Light and dark

The button at the end of the header switches this site between light and dark, and every preview with it; until you press it, the site follows your system. Both sides are `tradecn-amber`, warm paper by day and near-black by night, set in Inter with JetBrains Mono for code, the two faces the typography tokens name. The menu beside the button tries another theme on the site and every preview, both sides, until you pick amber again. A theme's own preview wears that theme in both modes whatever the menu says.
