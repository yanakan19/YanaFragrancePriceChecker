#!/usr/bin/env bash
# Run this ONCE on a fresh Oracle Cloud Always Free VM (Oracle Linux 9,
# VM.Standard.A1.Flex) to install Docker + Node, then set up FreeLLMAPI and
# this chatbot as always-on systemd services.
#
# Usage (as the opc user, via SSH):
#   chmod +x provision-oracle-linux9.sh
#   ./provision-oracle-linux9.sh
#
# Safe to re-run — each step checks before acting.
set -euo pipefail

echo "== Updating system packages =="
sudo dnf -y update

echo "== Installing Docker (Oracle Linux 9 uses dnf, not apt) =="
if ! command -v docker &>/dev/null; then
  sudo dnf -y install dnf-utils
  sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  echo "Docker installed. You may need to log out and back in for group membership to apply."
else
  echo "Docker already installed, skipping."
fi

echo "== Installing Node.js 20 =="
if ! command -v node &>/dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo dnf -y install nodejs
else
  echo "Node already installed, skipping."
fi

echo "== Opening firewall for HTTP-ish traffic (adjust for your reverse proxy plan) =="
# Oracle Linux uses firewalld by default. Port 3001 (FreeLLMAPI) should stay
# LOCAL ONLY (never expose it publicly — it's the raw router with your keys
# behind it). Port 4000 (this app) can be exposed directly, or better, put a
# reverse proxy (nginx/caddy) in front on 80/443 and only open those.
sudo firewall-cmd --permanent --add-port=4000/tcp || true
sudo firewall-cmd --reload || true

echo "== Also remember: Oracle's own Security List / NSG for the VCN must =="
echo "== separately allow inbound TCP on whatever port(s) you expose, in   =="
echo "== the OCI console (Networking -> VCN -> Security Lists).            =="

echo "== Done. Next steps: =="
echo "1. git clone https://github.com/tashfeenahmed/freellmapi.git ~/freellmapi"
echo "2. cd ~/freellmapi && generate ENCRYPTION_KEY into .env (see its README) && docker compose up -d"
echo "3. Add provider keys on http://<vm-ip>:3001 (or via SSH tunnel, don't expose 3001 publicly)"
echo "4. git clone <this repo> ~/YanaFragrancePriceChecker (or pull the pricesniffs.space integration branch)"
echo "5. cd into YanaFreeAPIMerger, cp .env.example .env, fill in FREELLMAPI_BASE_URL=http://localhost:3001 + key"
echo "6. sudo cp deploy/yanafreeapimerger.service /etc/systemd/system/"
echo "7. sudo systemctl daemon-reload && sudo systemctl enable --now yanafreeapimerger"
