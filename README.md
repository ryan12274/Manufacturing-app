# Team 7028 Manufacturing

A responsive manufacturing workspace for FRC Team 7028. No package installation or build step required.

## Run locally

Use Node.js 20 or newer:

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:7028. To validate, run `node --test`, `node --check dist/app.js`, and `node --check dist/model.js`.

## Features

- Create, edit, and delete part records with quantities, subsystems, materials, manufacturing processes, owners, deadlines, priorities, CAD links, and shop notes.
- Follow parts through Not started, Ready, In progress, Blocked, and Complete on the production board.
- Search and filter the register. Export the current filtered view as CSV.
- Track material stock, storage locations, units, and reorder thresholds.
- Download a JSON backup and restore a validated backup.
- Explore labeled sample data or use Start empty to clear the sample workspace.

## Data storage

Records are saved in localStorage in the current browser and website origin. This version does not provide accounts, shared team data, cloud synchronization, or file uploads. Separate devices and deployed/local versions have separate workspaces. Clearing browser data removes saved records. Use Backup regularly; CSV exports are for reporting and cannot be restored as a workspace. Concurrent editing in multiple tabs can overwrite changes.

Inventory is tracked manually. Completing a part does not deduct material automatically. Completed status applies to an entire part record and its quantity.

## Deployment

Serve `dist/` on any static host. `.openai/hosting.json` identifies the private Sites preview. A shared database and member permissions are the next step for team-wide deployment.
