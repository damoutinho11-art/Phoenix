# Google Calendar + Gmail read-only setup

Phoenix can optionally connect to Google Calendar and Gmail over OAuth2 to
unify your opera schedule and surface schedule-relevant email. This
integration is **read-only**. It cannot send email, create/edit/delete
calendar events, or modify anything in your Google account. Revoke access
anytime at https://myaccount.google.com/permissions or via the Disconnect
button in Phoenix's Connectors panel.

## 1. Create the Google Cloud OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or reuse) a project.
2. Enable the **Google Calendar API** and the **Gmail API** for that project.
3. Under APIs & Services > Credentials, create an **OAuth 2.0 Client ID**
   (Application type: Web application).
4. Add an authorized redirect URI matching `PHOENIX_GOOGLE_REDIRECT_URI`
   below (e.g. `http://localhost:8000/auth/google/callback` for local dev, or
   your deployed backend URL + `/auth/google/callback` in production).
5. On the OAuth consent screen, request only these scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/gmail.readonly`

## 2. Environment variables

| Variable | Purpose |
| --- | --- |
| `PHOENIX_GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console. |
| `PHOENIX_GOOGLE_CLIENT_SECRET` | OAuth client secret. Never logged or returned by any endpoint. |
| `PHOENIX_GOOGLE_REDIRECT_URI` | Must exactly match the redirect URI registered in Google Cloud Console. |
| `PHOENIX_TOKEN_ENCRYPTION_KEY` | A Fernet key used to encrypt stored OAuth tokens at rest. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. |
| `PHOENIX_GMAIL_DEFAULT_QUERY` | Optional. Overrides the default Gmail search query (defaults to opera/schedule-relevant terms). |
| `PHOENIX_PUBLIC_FRONTEND_URL` | The deployed PWA URL. Used to redirect back to `/calendar?connected=google` after a successful OAuth login. |

## 3. Connect

1. Open Phoenix's Calendar tab > Connectors.
2. Click **Connect** on the Google Calendar or Gmail card (either one starts
   the same OAuth flow, since both share one connection).
3. Approve the read-only consent screen in Google's UI.
4. Phoenix stores the encrypted access/refresh tokens and redirects you back
   to the Calendar tab.

## Safety contract

This integration is read-only. It cannot send email, create/edit/delete
calendar events, or modify anything in your Google account. Revoke access
anytime at https://myaccount.google.com/permissions or via the Disconnect
button.

- No write, send, modify, or delete Google/Gmail API methods are imported or
  called anywhere in this feature.
- No endpoint, log line, or error message ever contains a raw access token,
  refresh token, client_secret, or authorization code.
- Every connector endpoint degrades gracefully (200 + a safe "not connected"
  payload) when Google/Gmail aren't configured — it never returns a 500 for
  that case.
- Disconnect is the only destructive action in this feature. It is POST-only
  and requires explicit confirmation in the UI.
