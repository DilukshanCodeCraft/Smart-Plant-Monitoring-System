# Smart Plant Simple

A simplified full-stack version of the smart plant monitoring dashboard.

## Goals

- Keep backend and frontend logic minimal and readable.
- Show live monitoring status and round progress clearly.
- Show current round readings when the device exposes them.
- Store only finalized full 10-round batch readings in MongoDB.
- Keep UI modern and focused on only essential controls.

## Refined Logic Highlights

- Full batch only: API accepts only batchType=full and roundsUsed=10.
- No fake round reconstruction: per-round rows are stored only when device provides latestRound payload.
- Session-safe round display: overview prefers current device round, then latest DB round for the same active session.
- Clear columns for analysis: UI includes dedicated Finalized Batch table and Round Records table.

## Folder Structure

- backend: Express API + MongoDB models
- frontend: React + Vite dashboard
- HOW_IT_WORKS.md: Plain explanation of architecture and data flow

## Quick Start

1. Install root tooling:
   - npm install
2. Install backend dependencies:
   - npm --prefix backend install
3. Install frontend dependencies:
   - npm --prefix frontend install
4. Create backend env:
   - copy backend/.env.example to backend/.env and set values
5. Start both apps:
   - npm run dev

Optional isolated profile (recommended when you must not touch the main DB):

1. Use backend/.env.isolated (already prepared) or backend/.env.isolated.example
2. Start both apps with isolated backend:
   - npm run dev:isolated

## Ports

- Backend default: 5101
- Frontend default: 5174

## API Summary

- GET /api/health
- GET /api/overview
- GET /api/readings/latest
- GET /api/readings?limit=8&sort=desc
- GET /api/rounds?monitoringSessionId=session-1&limit=10&sort=asc
- POST /api/readings
- GET /api/device/:target/:state

## Main Data Columns

Finalized batch columns:

- createdAt
- deviceId
- monitoringSessionId
- batchType
- roundsUsed
- rootTempC
- airTempC
- humidity
- lux
- soilPercent
- mqRatio
- mqPPM
- weightG
- weightError

Round record columns:

- createdAt
- observedAt
- deviceId
- monitoringSessionId
- roundNumber
- source
- rootTempC
- airTempC
- humidity
- lux
- soilPercent
- mqRatio
- mqPPM
- weightG
- weightError
