# npm publishing (GitHub Actions + provenance)

This repo publishes to npm when a GitHub **Release** is created, via the workflow:

- `.github/workflows/publish_to_npm.yml`

The workflow uses `npm publish --provenance` with GitHub OIDC (`id-token: write`), matching the pattern used in `pearcetm/GeoTIFFTileSource`.

## One-time npmjs setup (Trusted Publisher)

To allow tokenless publishing from GitHub Actions, configure this package on npmjs as a **Trusted Publisher**.

In npmjs:

- Go to your package’s settings (or create the package first with an initial manual publish).
- Find **Provenance** / **Trusted Publishers** (wording varies).
- Add a GitHub Actions trusted publisher with:
  - **Owner**: `pearcetm`
  - **Repository**: `osd-paperjs-annotation`
  - **Workflow file**: `.github/workflows/publish_to_npm.yml`
  - **Environment**: (leave unset unless you use protected environments)

After this is set, creating a GitHub Release will publish the version from `package.json`.

## Release checklist

- Bump `package.json` version and commit it.
- Push to GitHub.
- Create a GitHub Release (tag like `vX.Y.Z` is typical).
- Verify the GitHub Action run succeeds and the matching version appears on npm.
