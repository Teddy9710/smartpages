# HTML Sanitization Design

## Scope

Resolve GitHub issues #43 and #49 by strengthening the existing HTML boundary used by generated Markdown, generated HTML, and export conversion.

## Design

`safeSetInnerHTML` remains the single DOM rendering boundary. It removes executable elements, event handlers, inline styles, `srcdoc`, and unsafe URL-bearing attributes. HTTP(S), mail, relative, fragment, and known image data URLs remain usable; scriptable schemes and non-image data URLs are removed.

`SidePanelManager._markdownToSafeHtml` applies the same policy through a shared sanitizer helper so exported Markdown cannot retain content that the live preview would reject. No remote dependency is added, keeping the Manifest V3 extension self-contained.

## Verification

Node tests provide a minimal DOM fixture and prove that JavaScript URLs, dangerous data URIs, inline CSS, event handlers, and embedded executable elements are removed while ordinary formatting and safe links survive. The complete repository verification command must pass before either issue is closed.
