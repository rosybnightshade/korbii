# rubber-ducky-websocket

Lightweight text-only chat server + CLI that uses WebSockets and Prisma (Postgres).

## Features

- WebSocket API for creating/joining conversations, registering/logging users, sending/listing messages
- Conversation codes (6-digit) and UUIDs
- Simple CLI client that talks to the server over WebSocket
- Prisma schema with User, Conversation, Participant, Message, ConnectionHistory

## Requirements

- Node 18+
- Postgres (or hosted provider like Aiven)
- npm

## Setup

1. Install dependencies

    npm install

2. Configure environment

    Copy `.env.example` or create `.env` in project root with at least:

    DATABASE_URL="postgres://user:pass@host:port/dbname?sslmode=verify-full"
    AIVEN_ROOT_CERT_PATH=./cert/ca.pem # if required for hosted DB

    The project loads `.env` via `import 'dotenv/config'` in `index.js` and `cli.js`.

3. Generate Prisma client (if changed schema)

    npm run db:generate

4. Run migrations / push schema

    npm run db:migrate

    # or for quick dev

    npm run db:push

## Running the server

Start the server:

npm run dev

By default the Express server listens on http://localhost:5500 and WebSocket upgrades happen on the same port.

## WebSocket API

All messages are JSON objects with { id, command, body } where id is a client-generated request id echoed back in responses.

Commands:

- register: body { username, email, password, name? }
    - Response: { id, status: 'success'|'failed', user?, message? }
- login: body { identifier, password }
    - Response: { id, status, user?, message? }
- createRoom: body { roomname? }
    - Response: { id, status, room?: { id, name, code }, message? }
- joinRoom: body { roomcode } (roomcode is numeric code or UUID)
    - Response: { id, status, room?: { id, name, code }, message? }
- sendMessage: body { conversationId, senderId, content }
    - conversationId can be conversation UUID or numeric code
    - Response: { id, status, message, conversationId }
- listMessages: body { conversationId, limit? }
    - Response: { id, status, messages[], conversationId }

Push events:

- The server now broadcasts newly created messages to connected clients in the same conversation as push objects: { event: 'message', message: <message> }

Notes:

- CLI now supports push-based watch mode which receives and prints pushed messages from the server. Polling is no longer required for watching.
- Responses include the incoming request `id` so clients can match replies.

## CLI

A CLI is included at `cli.js`. It is a WebSocket client (does not talk directly to DB).

Usage:

node cli.js

Commands in interactive mode:

- register — create account
- login — authenticate
- create-room — create room and auto-join
- join-room — join by code or id
- send — send message to current room (or specify id/code)
- list-messages — list recent messages
- watch / stop-watch — push-based watch for new messages (server will send { event: 'message', message })
- whoami — show session
- logout — remove session
- exit — quit

Session is stored in `.cli_session.json` in project root.

## Testing

- Basic project checks: node ./tests/test-suite.mjs
- WebSocket integration test: node ./tests/ws-test.mjs
- CLI: node ./cli.js

## Development notes

- Prisma client is generated into your node_modules by default. If you override generator output, update imports accordingly.
- DB SSL: use `AIVEN_ROOT_CERT_PATH` or `AIVEN_ROOT_CERT` env vars to provide CA for hosted services.

## Next improvements

- Add authentication tokens (JWT) and middleware
- Input validation and rate limiting

License: MIT
