# MindBloom

MindBloom is a Stellar Soroban mini-dApp for mindfulness and meditation tracking on-chain. People connect a Freighter wallet, create a public wellness profile, set a weekly mindfulness goal in minutes, log meditation or breathing sessions, build a calm streak across days, and follow a live activity feed sourced from recent Soroban contract events.

## Overview

MindBloom focuses on one Soroban contract and a polished React frontend:

- Wallet-backed wellness profiles stored on Soroban
- Weekly mindfulness-minute goals with validation and update flows
- Session logging for meditation, breathing, reflection, gratitude, and other calming rituals
- Calm streak tracking with automatic weekly progress resets
- Goal-reached milestone events emitted exactly at threshold crossing
- Public contract activity feed powered by Soroban RPC `getEvents`
- Responsive interface optimized for desktop and mobile

## Screenshots And Demo Assets

### MVP Video

- MVP demo: `https://drive.google.com/file/d/1fHp0BwfGhXBF8nMLWB0VrEmtB0oPgqnm/view?usp=sharing`

### UI Screens

Main dashboard:

![MindBloom UI Screenshot](./UI%20SS.png)

Responsive mobile view:

![MindBloom Mobile Screenshot](./mobile%20SS.png)


### CI/CD Screens

Workflow overview:

![MindBloom CI CD Screenshot](./ci%20cd%20ss.png)


## Architecture

### Soroban Contract

Contract name: `MindBloom`

Methods:

- `save_profile(mindful_user, display_name, weekly_goal_minutes)`
- `update_weekly_goal(mindful_user, new_goal_minutes)`
- `log_session(mindful_user, practice_type, minutes_spent)`
- `get_dashboard(mindful_user)`
- `get_session_count(mindful_user)`
- `get_session(mindful_user, index)`
- `has_profile(mindful_user)`

Emitted events:

- `profile_saved`
- `weekly_goal_updated`
- `session_logged`
- `weekly_goal_reached`

### Frontend

- React + Vite
- Freighter wallet integration
- Soroban RPC reads and writes through `@stellar/stellar-sdk`
- React Query for cached reads, refreshes, and activity polling
- Public event feed that remains useful before wallet connection

## Deployment Details

- Network: `Stellar Testnet`
- Contract alias: `mind_bloom`
- Contract ID: `CAE7XU2J57CXVFMU3PMYJWP6GSZI32TQZREOJPA7XT5H7D5YMT6HCQDM`
- Live contract: `https://lab.stellar.org/r/testnet/contract/CAE7XU2J57CXVFMU3PMYJWP6GSZI32TQZREOJPA7XT5H7D5YMT6HCQDM`
- WASM upload transaction: `652bb0756016d3d0de0a5060547c62478b1ab432dc925e4fe01495ba73b6c774`
- Contract deployment transaction: `646c87308064e4c04e17bf5b568f941cf65de41ab68f058b40af0ec017e4e8cd`
- Live app: `https://mindbloom-ledger-frontend.vercel.app`
- Deployment record: [deployments/testnet.json](./deployments/testnet.json)

## Local Setup

### 1. Install dependencies

```powershell
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```env
STELLAR_ACCOUNT=alice
STELLAR_NETWORK=testnet
STELLAR_CONTRACT_ALIAS=mind_bloom
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_CONTRACT_ID=CAE7XU2J57CXVFMU3PMYJWP6GSZI32TQZREOJPA7XT5H7D5YMT6HCQDM
```

### 3. Start the frontend

```powershell
npm run dev
```

Then open the Vite URL and connect Freighter on `Stellar Testnet`.

## Build, Test, and Deploy

### Run contract tests

```powershell
npm run contract:test
```

### Build the contract wasm directly

```powershell
npm run contract:wasm
```

### Build with Stellar CLI

```powershell
npm run contract:build
```

### Deploy to Stellar Testnet

```powershell
npm run contract:deploy
```

This writes a fresh deployment record to `deployments/testnet.json`.

Current deployed values:

- Contract: `CAE7XU2J57CXVFMU3PMYJWP6GSZI32TQZREOJPA7XT5H7D5YMT6HCQDM`
- Upload tx: `652bb0756016d3d0de0a5060547c62478b1ab432dc925e4fe01495ba73b6c774`
- Deploy tx: `646c87308064e4c04e17bf5b568f941cf65de41ab68f058b40af0ec017e4e8cd`

### Export frontend contract config

```powershell
npm run export:frontend
```

### Lint the frontend

```powershell
npm run lint
```

### Build the frontend bundle

```powershell
npm run build:frontend
```

## Vercel Configuration

Root `vercel.json`:

- Install command: `npm install`
- Build command: `npm run build:frontend`
- Output directory: `frontend/dist`

Required Vercel environment variables:

- `VITE_STELLAR_RPC_URL`
- `VITE_STELLAR_NETWORK_PASSPHRASE`
- `VITE_CONTRACT_ID`

Recommended values:

```env
VITE_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
VITE_STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_CONTRACT_ID=CAE7XU2J57CXVFMU3PMYJWP6GSZI32TQZREOJPA7XT5H7D5YMT6HCQDM
```

Current live deployment:

- App URL: `https://mindbloom-ledger-frontend.vercel.app`
- Inspect URL: `https://vercel.com/deep-sahas-projects-5b5ba27c/mindbloom-ledger-frontend/3VbpXssWdtGqGN8MxjZ3Cq659vid`

## Verification Steps

1. Open the app locally or after deployment.
2. Confirm the public activity feed loads without a wallet.
3. Connect Freighter on Stellar Testnet.
4. Create or update a wellness profile.
5. Log a mindfulness session and verify:
   - the dashboard updates
   - the recent sessions panel refreshes
   - the Soroban activity feed refreshes with the new event
6. Inspect the transaction link shown in the status banner.
7. Confirm tests, linting, and build checks pass.



## Project Structure

```text
contracts/mind_bloom/
frontend/
scripts/
deployments/
assets/
.github/workflows/
Cargo.toml
package.json
README.md
```

## Notes

- Freighter must be installed in the browser to submit transactions from the frontend.
- The app remains useful without a wallet because the contract activity feed is public.
- The Vercel project and public deployment URL now use the MindBloom name.
