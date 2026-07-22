# Build and release guide

## Pinned environment

- Windows 10 1809+ or Windows 11
- Node 22.17.0 (`.node-version`)
- npm 11.5.1 (`packageManager`)
- Rust 1.97.1 (`rust-toolchain.toml`)
- Visual Studio 2022 Build Tools: Desktop development with C++ and Windows SDK
- WebView2 Evergreen runtime

`package-lock.json` and `src-tauri/Cargo.lock` are mandatory. On a clean x64
Windows machine:

```powershell
git clone https://github.com/diorna-app/diorna.git
cd diorna
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm run tauri build -- --bundles msi,nsis
```

Outputs are under `src-tauri/target/release/bundle`. The Tauri configuration
builds English/French MSI and per-user NSIS packages and includes the WebView2
evergreen bootstrapper. ARM64 uses `rustup target add aarch64-pc-windows-msvc`
and `--target aarch64-pc-windows-msvc`.

## Signing

The client supplies an Authenticode code-signing certificate and password.
Store the base64 PFX as the protected `WINDOWS_CERTIFICATE` repository secret
and its password as `WINDOWS_CERTIFICATE_PASSWORD`; never commit either. The
release workflow imports it only on the ephemeral runner. Sign the executables,
MSI, NSIS installer, and updater artifacts, timestamp them, then verify with
`Get-AuthenticodeSignature`. A release without a valid client certificate is a
development artifact and must not be promoted.

The Tauri updater also requires a separate update-signing key in protected CI
secrets and its public key in `tauri.conf.json`. Portable packages disable
automatic update checks and place the vault beside `Diorna.exe`.

## Release procedure

1. Ensure CI, security audits, Windows 10/11 smoke tests, and `docs/nfr-report.md`
   are green and current.
2. Update versions consistently in `package.json`, `Cargo.toml`, and
   `tauri.conf.json`; update release notes and attribution.
3. Create an annotated signed `vX.Y.Z` tag from reviewed `main`.
4. Let the release workflow build x64/ARM64 MSI, NSIS, and portable archives.
5. Verify signatures, SHA-256 checksums, updater signature, clean-machine
   installation, silent flags, file associations, hotkey, tray, toast, and
   uninstall behaviour.
6. Publish the draft release only after two-person verification.

The workflow is deterministic for a given checkout and pinned toolchain. Code
signing timestamps and installer metadata intentionally make signed byte output
vary; unsigned compilation inputs and checksums remain auditable.
