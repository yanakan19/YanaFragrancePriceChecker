# Setup log

Running record of what was done to get YanaFreeAPIMerger working locally, so
this can be reproduced, debugged, or redone from scratch later.

## Environment

- Machine: Windows 11 Home, Acer Nitro AN14-41
- Shell used: Windows PowerShell (not WSL — WSL was tried first and caused
  confusion; stick to real PowerShell for all commands below)

## Steps completed

1. Cloned this repo, checked out branch `claude/perfume-chatbot-multi-agent-lvf17y`.
2. Installed Docker Desktop for Windows.
   - Hit a stuck "Starting the Docker Engine..." state caused by low free
     system memory (996 MB free at the time). Fixed by a full restart, then
     opening Docker Desktop first before anything else.
3. Cloned FreeLLMAPI separately into `~/freellmapi` (a sibling folder to this
   repo, NOT inside it):
   ```powershell
   cd $HOME
   git clone https://github.com/tashfeenahmed/freellmapi.git
   cd freellmapi
   ```
4. Generated an encryption key and wrote `~/freellmapi/.env`:
   ```powershell
   $Bytes = New-Object Byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
   $ENCRYPTION_KEY = -join ($Bytes | ForEach-Object { "{0:x2}" -f $_ })
   "ENCRYPTION_KEY=$ENCRYPTION_KEY`nPORT=3001" | Out-File -Encoding utf8 .env
   ```
5. Started the router:
   ```powershell
   docker compose up -d
   ```
   Verified with `docker compose ps` and by loading `http://localhost:3001`.
6. Hit the "setup code required" first-run gate. Retrieved the code from:
   ```powershell
   docker compose logs
   ```
7. Added 4 free provider keys on the FreeLLMAPI dashboard (Keys page):
   - Google AI Studio
   - Groq
   - Mistral
   - Cohere
8. Copied the unified `freellmapi-...` key from the Keys page header.
   - **Note:** an early key was pasted into the Claude chat session and should
     be treated as compromised — regenerate it in the dashboard and only ever
     store the live one in the local `.env` below, never in chat/logs.

## Still to do

- [ ] Put the (regenerated) unified key into `YanaFreeAPIMerger/.env`:
      ```
      FREELLMAPI_BASE_URL=http://localhost:3001
      FREELLMAPI_API_KEY=freellmapi-your-unified-key
      ```
- [ ] Visit `http://localhost:3001/v1/models` and copy the actual available
      model ids (depends on which of the 4 provider keys are healthy) into
      `YanaFreeAPIMerger/server/config/agents.json`, replacing the placeholder
      list.
- [ ] `cd YanaFreeAPIMerger && npm install && npm start`
- [ ] Open `http://localhost:4000` and test a price question and a
      notes-suggestion question.

## Where things live

| Thing | Path |
|---|---|
| This chatbot app | `YanaFragrancePriceChecker/YanaFreeAPIMerger/` |
| FreeLLMAPI router (separate project) | `~/freellmapi/` (sibling to the repo, not inside it) |
| Agent model list | `YanaFreeAPIMerger/server/config/agents.json` |
| Chatbot's own secrets | `YanaFreeAPIMerger/.env` (gitignored) |
| Router's own secrets | `~/freellmapi/.env` (gitignored, in the other repo) |
| Scoring matrix logic | `YanaFreeAPIMerger/server/scoring.js` |
| Price data (currently mock) | `YanaFreeAPIMerger/server/data/prices.json` |

## To redo this from a clean machine

Follow `README.md` in this folder top to bottom — it's the condensed version
of everything above.
