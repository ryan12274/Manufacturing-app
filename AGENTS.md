# Development and release workflow

- Use `preview` for ongoing development and review. Reuse this branch unless the user requests another branch.
- Keep `main` as the production release branch. Do not commit or push development changes directly to `main`.
- Default to local implementation and local verification. Push requested shared previews to `preview`.
- Do not merge into `main`, push `main`, or deploy production to Netlify, Sites, or another host unless the user explicitly requests a release or production deployment. Finishing a code change alone does not authorize production publication.
- A request to preview a change authorizes a local preview or an existing configured non-production preview, not a production deployment.
- Preserve the current hosting audience, server credentials, and production records. Use isolated test data for preview verification.
- Netlify project `7028man` (https://7028man.netlify.app/) has `main` as its production branch and `preview` as its individually enabled branch deployment, verified 2026-11-23. Do not claim that a remote preview is available until its deployment succeeds. At that check the public site returned 404 and build/publish settings were unset; backend migration to Netlify has not been implemented.
- Do not replace the server-backed application with a static-only deployment. Preserve shared storage, server-side permissions, and the approved read-only Onshape BOM integration.
