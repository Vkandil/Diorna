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
npx tauri build
```

The local command creates the testable installer at
`src-tauri/target/release/bundle/nsis/Diorna_<version>_x64-setup.exe` and the
unpacked executable at `src-tauri/target/release/diorna.exe`. The NSIS
installer includes the WebView2 evergreen bootstrapper and supports English
and French.

Release CI overrides the local NSIS-only default with `--bundles msi,nsis` to
produce both signed installer formats. ARM64 uses
`rustup target add aarch64-pc-windows-msvc` and
`--target aarch64-pc-windows-msvc`.

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

Generate the updater key once on an offline or trusted Windows machine. Keep
the private file and password outside the repository:

```powershell
$diornaKeyDir = Join-Path $env:USERPROFILE ".tauri"
New-Item -ItemType Directory -Force -Path $diornaKeyDir | Out-Null
$diornaPrivateKey = Join-Path $diornaKeyDir "diorna-updater.key"
npx tauri signer generate --write-keys $diornaPrivateKey
```

Create these GitHub Actions repository secrets:

- `TAURI_UPDATER_PRIVATE_KEY`: complete contents of `diorna-updater.key`
- `TAURI_UPDATER_PRIVATE_KEY_PASSWORD`: the password entered at generation
- `TAURI_UPDATER_PUBLIC_KEY`: complete contents of `diorna-updater.key.pub`
- `WINDOWS_CERTIFICATE`: base64 contents of the Authenticode `.pfx`
- `WINDOWS_CERTIFICATE_PASSWORD`: password of that `.pfx`

Copy the PFX as base64 without printing it into terminal history:

```powershell
$diornaPfx = (Resolve-Path "C:\secure\Diorna-signing.pfx").Path
[Convert]::ToBase64String([IO.File]::ReadAllBytes($diornaPfx)) | Set-Clipboard
```

Paste the clipboard into the `WINDOWS_CERTIFICATE` secret. Never place either
signing private key in a repository variable, workflow file, issue, or log.

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
