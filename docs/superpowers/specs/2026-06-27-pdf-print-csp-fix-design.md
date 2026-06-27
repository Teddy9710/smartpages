# PDF Print CSP Fix

## Problem

The PDF print document currently contains an inline script that calls
`window.print()`. The print window inherits the extension's Manifest V3 content
security policy, so Chrome blocks that script and reports a CSP violation.

## Design

- `SidePanelManager.buildPdfPrintHtml()` will produce a script-free printable
  HTML document.
- `SidePanelManager._openPdfPrintWindow()` will register a one-time `load`
  listener on the newly opened window before writing the document.
- When the printable document finishes loading, the listener will focus the
  window and request printing after the existing short delay. The delay runs in
  the extension side-panel context and therefore does not require inline code in
  the print document.
- If a print window cannot be opened, the existing HTML-download fallback will
  remain unchanged.

## Testing

- Assert generated print HTML contains neither a `<script>` element nor
  `window.print()`.
- Assert the print window registers a one-time load listener before document
  writing.
- Invoke the captured load listener and assert that printing is requested.
- Run the complete test, lint, type-check, and build verification command.

## Scope

This change only addresses the PDF print CSP violation. It does not change PDF
layout, export naming, or the fallback download behavior.
