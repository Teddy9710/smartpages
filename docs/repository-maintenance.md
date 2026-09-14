# Repository assets and releases

Release downloads are hosted in [GitHub Releases](https://github.com/Teddy9710/smartpages/releases).
The former root archives for v1.2.0 and v1.3.0 were verified against the SHA-256
digests of their Release attachments before removing the duplicate files.

Build with `npm run build`, then run `python scripts/package-extension.py` to
create an ignored ZIP containing only `dist/`. Pushing a version tag matching
`manifest.json` runs the release workflow and uploads the archive after verification.

Promotional PNGs in `assets/` use Git LFS. Install Git LFS and run `git lfs install`
before cloning; an existing checkout can obtain the images with `git lfs pull`.
Code-only CI does not need to download these promotional assets. `video/out/`
and root release archives are ignored.

These changes do not rewrite existing Git history. Old binary blobs remain in
historical commits; reclaiming that historical space requires a separately
coordinated history migration and force push.

# Cloud authentication storage

Supabase tokens use `chrome.storage.session` under a provider-specific key.
Legacy local tokens are discarded when a session is checked, and changing the
Supabase project invalidates its session. Browser restart requires signing in again.
CloudBase uses its SDK's session persistence; its session is separate from Supabase.
Previously stored CloudBase SDK local data is not automatically erased by this change.

CloudBase's `accessKey` field accepts a **Publishable Key**, as labeled in Settings;
Supabase's `anonKey` is also a public client key. These configuration keys remain
in local storage. Server secrets must not be entered into either field. Session
storage limits persistence but does not protect tokens from malicious code running
inside an extension page; HTML sanitization remains necessary.
