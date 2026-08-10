#!/usr/bin/env bash
#
# Provisions a fresh Oracle Cloud Always Free VM (Oracle Linux 9, ARM,
# VM.Standard.A1.Flex) to run the Virtual Yanny backend behind nginx.
#
# What this script does NOT do: fix VCN/route table networking. If the
# Internet Gateway -> 0.0.0.0/0 route rule is failing with "Rules in the
# route table must use private IP as a target", that is an OCI account-level
# hold (commonly a temporary fraud/identity review on a brand new free-trial
# account), not something fixable from inside the instance — there is
# nothing for a script running on the VM to do about it. Wait for Oracle to
# clear the hold (typically hours to 1-2 days), then continue here.
#
# Run as root (or via sudo) on a freshly created instance:
#   sudo bash provision-oracle-linux9.sh <git-clone-url> <git-branch>
#
set -euo pipefail

REPO_URL="${1:?usage: provision-oracle-linux9.sh <git-clone-url> <git-branch>}"
REPO_BRANCH="${2:?usage: provision-oracle-linux9.sh <git-clone-url> <git-branch>}"
INSTALL_ROOT=/opt/pricesniffs
CHECKOUT_DIR="$INSTALL_ROOT/YanaFragrancePriceChecker"
SERVICE_USER=virtualyanny

echo "== Packages =="
dnf -y update
dnf -y install git nginx certbot python3-certbot-nginx firewalld

echo "== Node.js 22 (NodeSource, aarch64) =="
if ! command -v node >/dev/null || [ "$(node -v | grep -oE '^v[0-9]+' | tr -d v)" -lt 22 ]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf -y install nodejs
fi
node -v
npm -v

echo "== Service user =="
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "== Checkout =="
mkdir -p "$INSTALL_ROOT"
if [ -d "$CHECKOUT_DIR/.git" ]; then
  git -C "$CHECKOUT_DIR" fetch origin "$REPO_BRANCH"
  git -C "$CHECKOUT_DIR" checkout "$REPO_BRANCH"
  git -C "$CHECKOUT_DIR" reset --hard "origin/$REPO_BRANCH"
else
  git clone --branch "$REPO_BRANCH" "$REPO_URL" "$CHECKOUT_DIR"
fi
chown -R "$SERVICE_USER":"$SERVICE_USER" "$CHECKOUT_DIR"

echo "== Backend dependencies =="
cd "$CHECKOUT_DIR/YanaFreeAPIMerger"
sudo -u "$SERVICE_USER" npm install --omit=dev

if [ ! -f .env ]; then
  echo "!! No .env found in YanaFreeAPIMerger/. Copy .env.example to .env and fill in"
  echo "!! FREELLMAPI_BASE_URL / FREELLMAPI_API_KEY before starting the service."
  cp .env.example .env
  chown "$SERVICE_USER":"$SERVICE_USER" .env
  chmod 600 .env
fi

echo "== systemd service =="
cp "$CHECKOUT_DIR/deploy/yanafreeapimerger.service" /etc/systemd/system/yanafreeapimerger.service
sed -i "s#/opt/pricesniffs/YanaFragrancePriceChecker#$CHECKOUT_DIR#g" /etc/systemd/system/yanafreeapimerger.service
systemctl daemon-reload
systemctl enable yanafreeapimerger.service
echo "Not starting it yet — fill in .env first, then: systemctl start yanafreeapimerger"

echo "== Firewall (OS level — the OCI security list/NSG for the VCN still needs 80/443 open separately) =="
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

echo "== nginx =="
cp "$CHECKOUT_DIR/deploy/nginx-pricesniffs-api.conf.example" /etc/nginx/conf.d/pricesniffs-api.conf
echo "Edit /etc/nginx/conf.d/pricesniffs-api.conf: replace api.pricesniffs.space with the"
echo "real hostname, then: certbot --nginx -d <hostname>   (issues the cert and rewrites"
echo "the ssl_certificate paths for you), then: systemctl reload nginx"

cat <<'EOF'

== Next steps ==
1. Wait for the OCI networking hold to clear (see this script's own header comment).
2. Point a DNS A/AAAA record at this instance's public IP.
3. Edit YanaFreeAPIMerger/.env with real FREELLMAPI_BASE_URL / FREELLMAPI_API_KEY.
4. Edit /etc/nginx/conf.d/pricesniffs-api.conf with the real hostname.
5. certbot --nginx -d <hostname>
6. systemctl start yanafreeapimerger
7. curl https://<hostname>/api/health   should report {"ok":true,...}
8. Set that hostname as VIRTUAL_YANNY_API_BASE_URL in the parent repo's
   demo/virtualYanny.ts, then rebuild and redeploy the site (npm run demo).
EOF
