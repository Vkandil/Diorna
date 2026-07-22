# Security policy

Please report vulnerabilities privately through GitHub Security Advisories;
do not open a public issue until a fix is available. Include affected version,
reproduction steps, impact, and suggested mitigation. The maintainers will
acknowledge a complete report within five business days.

The current minor release receives security fixes. Diorna stores summariser
credentials only through Windows DPAPI under the application-data directory.
Never put a key in the vault, repository, log, screenshot, or issue. Markdown,
HTML, Mermaid SVG, filenames, archive members, import sources, and external
URLs are security boundaries. Import paths must reject traversal and symlinks
escaping the chosen source.

Release artifacts must be produced by the documented workflow, signed with
the client certificate, accompanied by checksums, and traced to an annotated
tag. Dependabot and `npm audit`/`cargo audit` results are release gates.
