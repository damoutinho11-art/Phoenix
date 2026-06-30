# FreeLLMAPI Railway Persistent Wrapper

This wrapper runs the upstream FreeLLMAPI image on Railway with a persistent SQLite database.

## Why this exists

The upstream image already creates `/app/server/data` for SQLite. On Railway, attaching a volume can replace that directory with a mounted directory whose ownership does not match the `node` runtime user. That can make SQLite fail with `unable to open database file`.

This wrapper starts as root, creates and chowns `/app/server/data`, touches the configured SQLite file, then drops to the `node` user before starting FreeLLMAPI.

## Railway service settings

Deploy this folder as its own Railway service:

- Root directory: `freellmapi-railway-wrapper`
- Volume mount path: `/app/server/data`
- `PORT=3001`
- `HOST_BIND=0.0.0.0`
- `FREEAPI_DB_PATH=/app/server/data/freellmapi.db`
- `ENCRYPTION_KEY=<new stable 64-character hex key>`

Keep the same Railway volume and the same `ENCRYPTION_KEY` after first production setup. Changing the encryption key can make previously stored provider keys unreadable.

## After deployment

1. Open the Railway public URL.
2. Add provider keys in FreeLLMAPI: Groq, Google, OpenRouter.
3. Test the Playground.
4. Copy the generated `freellmapi-...` unified key.
5. Update Phoenix production variables:

```text
PHOENIX_AI_PROVIDER=freellmapi
PHOENIX_LLM_BASE_URL=https://<new-wrapper-service>.up.railway.app/v1
PHOENIX_LLM_API_KEY=<freellmapi unified key>
```

Then confirm Phoenix `/jarvis/ai/status` still reports:

```text
selected_provider = freellmapi
configured = true
missing = []
```
