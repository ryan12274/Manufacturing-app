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

## Onshape BOM import

Choose **More → Onshape import**. This app reads only the configured assembly BOM, using signed GET requests to the Onshape assembly BOM endpoint. It never scans documents, queries Part Studios or part metadata, follows links to other documents, creates a BOM, or writes to Onshape. Requests set generateIfAbsent=false, indented=false, includeExcluded=false, and includeTopLevelAssemblyRow=false. An absent BOM is an error; there is no fallback source.

Runtime configuration is held in the private Site settings:

- ONSHAPE_ACCESS_KEY and ONSHAPE_SECRET_KEY: API credentials stored as secrets.
- ONSHAPE_SOURCE_URLS: a JSON array containing the explicitly approved assembly URL, including its document, workspace/version, and element IDs. The currently authorized source is the assembly link supplied by the owner. Source URLs are stored as secrets.
- ONSHAPE_BASE_URL: optional Onshape origin, default https://cad.onshape.com.

The flattened BOM supplies part number, name, material, CAD link, and quantity. Only leaf-part rows whose Part number begins with 7028 import. Subassemblies and excluded rows are skipped. Quantities must be positive whole counts. Repeated imports update linked records' BOM-owned details and quantity while preserving workers, preassignments, stage, blocked tag, notes, processes, subsystem, and deadlines. No part is deleted automatically. Conflicting part numbers are skipped and shown in the import panel.

Automatic import runs every five minutes while the app is open and visible, after being enabled in this browser. Shop progress and imported records are still stored on this device. The app does not sync local workspaces between devices or run imports while closed.

For local testing, copy .env.example to an ignored .env, enter values privately, build the Worker, then use node --env-file=.env scripts/serve.mjs. Never commit or display credential values. Live testing confirmed read-only access to the owner's existing BOM. Automated tests also enforce the BOM-only GET endpoint and disabled BOM generation.

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

## COTS purchasing

The COTS tab tracks purchased parts separately from manufactured parts and the BOM import. Record a vendor, vendor part number, product link, required quantity, ordered quantity, received quantity, delivery date, order/PO number, and notes. REV and WCP are suggested vendors; any vendor name is accepted. Status is derived from quantities and supports partial orders and deliveries. Mark ordered and Mark received update only the local tracker, and never place orders. CSV exports and JSON backups include COTS records; older backups load with an empty COTS list.

Vendor summaries show all outstanding items, independent of table filters. WCP Add to cart resolves public product variants using the exact vendor SKU or the selected option in the product URL, then creates a multi-item cart permalink for the quantities still to order. Repeated variants are combined. If any item is missing a valid product link, has an ambiguous option, or is unavailable, no partial cart link is produced. The user opens the link and reviews the vendor cart. Cart links can change an existing WCP cart, and inventory limits are enforced by the vendor. Checkout remains on the vendor website.

A supported bulk-cart link has not been verified for REV or other vendors. Their Order list action provides a copyable list and product links. Vendor cart actions do not mark parts as ordered.

References: [Shopify cart permalinks](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks), [Shopify public product API](https://shopify.dev/docs/api/ajax/reference/product), and [WCP storefront](https://wcproducts.com/).
