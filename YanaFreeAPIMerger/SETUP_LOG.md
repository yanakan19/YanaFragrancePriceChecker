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

9. Regenerated the unified key (an earlier one had been pasted into chat) and
   set it in `YanaFreeAPIMerger/.env`.
10. Pulled the real model ids from the running instance:
    ```powershell
    $key = "your-actual-freellmapi-key-here"
    (Invoke-RestMethod -Uri "http://localhost:3001/v1/models" -Headers @{Authorization="Bearer $key"}).data | Select-Object id | Format-Table -AutoSize
    ```
    and updated `YanaFreeAPIMerger/server/config/agents.json` with 28 real,
    confirmed-working ids spanning all 4 providers (google/groq/mistral/cohere),
    excluding code-specific models not useful for perfume chat.

## Deploying beyond localhost (Oracle Cloud Always Free)

Goal: pricesniffs.space is a static site (GitHub Pages) with no live
database or server — the actual TypeScript data modules (`demo/data.ts`,
`demo/catalogue.generated.ts`, `src/services/priceService.ts`, etc.) are
regenerated hourly by CI and committed to the repo. The chatbot needs an
always-on Node host to import/read those modules directly and to run
FreeLLMAPI — GitHub Pages can't host either. Chose Oracle Cloud's Always
Free tier (genuinely free forever, not the 30-day/$300 trial credit) for
this, running both FreeLLMAPI and the chatbot on one VM.

Progress so far:

1. Signed up for Oracle Cloud (billing country UK, home region UK South /
   London). Confirmed via Oracle's own account page: card is verification-
   only, no charge unless the account is manually upgraded to Paid — Always
   Free resources stay free indefinitely either way.
2. Attempted to create a Compute instance (`pricesniffs-router`), Oracle
   Linux 9, shape `VM.Standard.A1.Flex` (Always Free-eligible ARM shape).
   - Hit `Out of capacity for shape VM.Standard.A1.Flex in AD-1` — a common,
     known issue for this popular free shape, especially in busy regions.
     Plan: retry at 2 OCPU/12GB instead of 4/24 (smaller requests sometimes
     succeed when the max doesn't); fall back to `VM.Standard.E2.1.Micro`
     (x86, much less contested, 1 OCPU/1GB) if it keeps failing.
   - The inline "create new VCN" option inside the instance wizard would not
     let a public IP be assigned (kept warning "must select a public
     subnet" even with the public-subnet radio selected) — looked like a
     console UI bug. Worked around by creating the network manually instead:
3. Created a VCN by hand: **Networking → Virtual Cloud Networks → Create
   VCN**, named `PriceSniffs`, IPv4 CIDR `10.0.0.0/16`.
4. Created an Internet Gateway on that VCN (`pricesniffs-igw`).
5. **BLOCKED HERE:** adding a route rule on the Default Route Table
   (Internet Gateway → `0.0.0.0/0`) fails with:
   `API Error: Rules in the route table must use private IP as a target.
   Or the route table can be empty (no rules).`
   Persisted after a full page refresh and retry, so likely a genuine
   **Oracle free-trial account restriction** (temporary fraud/identity
   review hold that blocks internet-facing networking on brand-new trial
   accounts) rather than a UI glitch — no fix from our side, expected to
   clear on Oracle's end within hours to ~1-2 days. Decided to wait it out
   rather than open a support ticket, and use the time to prep deployment
   scripts (this section + `deploy/` folder) so setup is fast once unblocked.

### Once the account restriction clears, resume here:

1. Retry: Route Tables → Default Route Table for PriceSniffs → Add Route
   Rules → Internet Gateway → `0.0.0.0/0` → target `pricesniffs-igw`.
2. Subnets tab → Create Subnet → name `pricesniffs-public-subnet`, CIDR
   `10.0.0.0/24`, Route Table = Default Route Table, Subnet Access = Public
   Subnet.
3. Compute → Create Instance → name `pricesniffs-router`, Oracle Linux 9,
   `VM.Standard.A1.Flex` at 2 OCPU/12GB (retry 4/24 first if capacity allows).
   Networking step: select the existing `PriceSniffs` VCN and
   `pricesniffs-public-subnet`, confirm "Automatically assign public IPv4
   address" is on. Generate + download the SSH key pair if not already done.
4. Once Running, grab the instance's public IP, then SSH in:
   ```powershell
   ssh -i path\to\downloaded-private-key opc@<public-ip>
   ```
   (Oracle Linux's default user is `opc`, not `ubuntu`.)
5. Run `deploy/provision-oracle-linux9.sh` from this repo (scp it up, or
   `git clone` the repo on the VM and run it from there) — installs Docker +
   Node, opens the firewall port for the app.
6. **Also open the port in the OCI console itself**: the VM's Security
   List/NSG (Networking → VCN → Security Lists → Default Security List) needs
   an explicit "Allow" ingress rule for whatever port you expose (80/443 if
   using the nginx reverse proxy in `deploy/nginx-pricesniffs-api.conf.example`,
   or 4000 if exposing the app directly) — the OS firewall alone isn't enough,
   OCI blocks at the network layer too.
7. Set up FreeLLMAPI on the VM (same steps as the local install, but do NOT
   expose port 3001 publicly — access its dashboard via an SSH tunnel:
   `ssh -i key -L 3001:localhost:3001 opc@<public-ip>`, then browse
   `localhost:3001` on your own machine).
8. Clone this app (or the pricesniffs.space integration branch) onto the VM,
   set up `.env` there, install `deploy/yanafreeapimerger.service` as a
   systemd unit so it survives reboots/crashes.
9. If exposing under a real subdomain (e.g. `api.pricesniffs.space`): follow
   `deploy/nginx-pricesniffs-api.conf.example` — point DNS at the VM's IP,
   install nginx + certbot for HTTPS.

## Still to do

- [ ] `cd YanaFreeAPIMerger && npm install && npm start`
- [ ] Open `http://localhost:4000` and test a price question and a
      notes-suggestion question.
- [ ] If any agent ids come back failing consistently (check the agent
      ✓/✗ chips in the UI), remove/replace that id in `agents.json` — a
      free-tier key can be rate-limited or a model temporarily unavailable.

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
