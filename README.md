# Team 7028 Manufacturing

A responsive manufacturing workspace for FRC Team 7028, with a server-side Onshape API integration. No package installation required.

## Run locally

Use Node.js 20 or newer:

```sh
node scripts/build-worker.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:7028. To validate, run `node --test`, `node --check dist/app.js`, and `node --check dist/model.js`.

## Features

- Create, edit, and delete part records with quantities, subsystems, materials, manufacturing processes, owners, deadlines, priorities, CAD links, and shop notes.
- Follow parts through Not started, Preparing, Cutting, Finishing, and Finished on the production board.
- Search and filter the register. Export the current filtered view as CSV.
- Track material stock, storage locations, units, and reorder thresholds.
- Download a JSON backup and restore a validated backup.
- Explore labeled sample data or use Start empty to clear the sample workspace.

## Shop mode

Select **Shop mode** to use a display-friendly production board. Bookmark the app with `?shop=1` to open directly in shop mode. The five manufacturing-stage lanes show large part cards, assigned owners, quantities, manufacturing processes, deadlines, and blocker notes. Start preparing or move a part to its next stage with the large action buttons. Status menus allow other transitions. Materials switches to a large inventory view; Exit shop mode returns to the regular workspace.

Fullscreen and Keep awake are optional browser features. If unsupported, the app shows a message and remains usable. Wake lock is requested only after tapping Keep awake and released on leaving shop mode. On smaller displays the lanes wrap; long columns scroll by touch. At 1920-pixel width all five lanes appear side by side.

Shop mode uses the same browser-local workspace as the normal view. It does not sync with other team devices.

### Starting and assigning work

Parts are unassigned by default. Starting an unassigned part opens **Who’s working?** with name buttons from existing records and a field for a new name. Selecting a name and confirming starts work and saves that worker. Cancel leaves the part unchanged. The same rule applies to status menus and changing status in the part editor.

The optional **Preassigned worker (optional)** field preassigns a worker. Starting that part keeps the advance assignment and skips the name picker. Existing owner assignments are preserved when older workspaces or backups are loaded. Worker selections are separate from advance assignments, so restarting self-selected work asks who is starting it again. CSV exports include both the worker (`owner`) and advance assignment (`assignedTo`).

This browser-local version does not authenticate users or enforce admin roles. The advance assignment field is an administrative workflow control; restricting it to actual admins requires accounts and permissions.

## Branding

The palette uses yellow `#FFD400`, black, white, and deep navy. Yellow is taken from [the official Team 7028 stylesheet](https://www.7028robotics.com/style.css); navy reflects [the official Binary Battalion logo](https://www.7028robotics.com/images/7028-logo.png).

## Onshape API imports

Choose **More → Onshape import**. The API connection is initially unconfigured. Add the following runtime settings through the private Site's environment settings when the team has Onshape access. Do not enter credentials into the smart board, commit them to GitHub, or place them in browser storage.

- `ONSHAPE_ACCESS_KEY`: read-only Onshape API access key, stored as a secret.
- `ONSHAPE_SECRET_KEY`: matching API secret key, stored as a secret.
- `ONSHAPE_SOURCE_URLS`: JSON array of one to five Onshape document workspace/version or Part Studio URLs. Store as a secret when documents are private. A source URL has the shape `https://cad.onshape.com/documents/DOCUMENT_ID/w/WORKSPACE_ID`, optionally followed by `/e/ELEMENT_ID`. Versions and microversions can use `v` or `m` in place of `w`.
- `ONSHAPE_BASE_URL`: optional server origin, default `https://cad.onshape.com`. Enterprise sources must use this same configured Onshape origin.

For local development, copy `.env.example` to an ignored `.env`, set the values privately, build the Worker, and run `node --env-file=.env scripts/serve.mjs` with a Node version supporting `--env-file`. Redeploy the private Site after changing production runtime values.

The server makes signed, read-only requests to Onshape's documented `GET /api/v16/parts/d/{documentId}/{wvm}/{referenceId}` endpoint, or its `/e/{elementId}` variant. It imports only explicit `partNumber` values beginning with `7028`. Names beginning with 7028 are not sufficient. Folder discovery, assembly BOM quantities, configured variants beyond the selected source configuration, and unattended background sync are outside this version's scope.

**Find parts** previews matches. **Import parts** adds new part definitions with quantity 1, Not started status, and no worker assignment. Source identity is retained in JSON backups. Repeating an import does not duplicate parts. Later imports update CAD-owned name, part number, material, and CAD URL for linked records while preserving quantities, workers, advance assignments, status, process, subsystem, notes, and deadlines. Manual records with matching numbers and ambiguous numbers in Onshape are skipped and reported. No import deletes parts. Quantity must be set by the team, since this is not an assembly BOM import.

Opt in to automatic import to add and update matching parts every five minutes while this display is open and visible. The preference is specific to the browser. Sync pauses while dialogs are open and never writes back to Onshape. Its results still belong to the browser-local workspace; other devices do not receive them automatically. Network failures leave the current workspace intact.

Implemented against [Onshape's official API reference](https://github.com/onshape-public/go-client/blob/master/onshape/docs/PartApi.md) and [request-signature authentication guide](https://onshape-public.github.io/docs/auth/apikeys/). Live API verification requires the team's configured credentials and source documents. Automated tests use representative, mocked Onshape responses.

## Data storage

Records are saved in localStorage in the current browser and website origin. This version does not provide accounts, shared team data, cloud synchronization, or file uploads. Separate devices and deployed/local versions have separate workspaces. Clearing browser data removes saved records. Use Backup regularly; CSV exports are for reporting and cannot be restored as a workspace. Concurrent editing in multiple tabs can overwrite changes.

Inventory is tracked manually. Completing a part does not deduct material automatically. Finished status applies to an entire part record and its quantity.

## Deployment

Run `node scripts/build-worker.mjs` to create the self-contained Cloudflare Worker at `dist/server/index.js`. It embeds the browser files and serves both the app and its Onshape read-only API routes. `.openai/hosting.json` identifies the private Site; keep its existing access policy. The Site's private authentication boundary protects the API. The browser assets can still be served statically, but Onshape API routes require the Worker. A shared database and member permissions are the next step for team-wide deployment.

## Register and production workflow

The parts register is the planning catalog: part number, material, process, required quantity, subsystem, CAD link, source, priority, and deadline. The production board is the operational view: worker, stage, next-stage action, and a separate Blocked tag. Both use the same records.

Stages are Not started → Preparing → Cutting → Finishing → Finished. Blocked is a boolean tag available in every stage, through card controls or the part editor. Adding or removing it does not move the part or reset its worker. Filter Blocked only to see blockers across all five lanes. Add a reason in shop notes. The tag stays attached when a stage changes until explicitly removed. CSV and JSON backups retain both stage and blocked state.

Old saved records and backups migrate on loading: Ready → Preparing; In progress → Cutting; Complete → Finished. Old Blocked records become Preparing with the Blocked tag because the previous model did not retain a manufacturing stage. Existing assignments and notes are preserved.

## Interface

The header contains Parts, Production, and Materials. Shop mode opens the touch display. More contains Onshape import, CSV export, backup, and restore. The parts screen is a table; production is a five-lane board with compact active, blocked, and finished counts. Cards have one next-stage action, a Block/Unblock control, and a More menu for manual stage changes. The interface uses one stylesheet and system fonts.
