#!/bin/bash

# Stop on the first error
set -e

# Logging helpers
function echo_info {
    echo -e "\e[32m[INFO]\e[0m $1"
}

function echo_error {
    echo -e "\e[31m[ERROR]\e[0m $1"
}

# Port the site is served on
MINISITE_PORT=${MINISITE_PORT:-8080}

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

echo_info "Installing system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx curl build-essential nodejs npm ufw postgresql redis-server

echo_info "Installing application dependencies..."
cd "$REPO_ROOT/main-server"
npm install

echo_info "Configuring nginx..."
sudo rm -f /etc/nginx/sites-enabled/default

# nginx site config
sudo tee /etc/nginx/sites-available/anime4kzone.conf > /dev/null <<EOF
server {
    listen $MINISITE_PORT;
    server_name _;

    root /main-server/public;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Everything the browser calls is proxied to the Node server, so the client
    # uses same-origin paths and needs no CORS.
    location ~ ^/(upload|uploads|update-job|queue-status|proxy-cover|get-high-quality-cover|health) {
        proxy_pass http://localhost:9090;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Source files reach 3 GB and upscaling a single episode runs for hours.
        client_max_body_size 3g;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/anime4kzone.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

echo_info "Looking up the external IPv4 address..."
EXTERNAL_IP=$(curl -4 -s ifconfig.me)
if [ -z "$EXTERNAL_IP" ]; then
    echo_error "Could not determine the external IPv4 address."
    exit 1
fi

echo_info "External IP address: $EXTERNAL_IP"


echo_info "Opening port $MINISITE_PORT in the firewall..."
# Enable ufw if it is not already running
UFW_STATUS=$(sudo ufw status | grep -o "Status: active" || true)

if [ -z "$UFW_STATUS" ]; then
    echo_info "UFW is not active. Enabling it..."
    sudo ufw enable
fi

sudo ufw allow $MINISITE_PORT
sudo ufw allow 22/tcp
sudo ufw reload

echo_info "Installing the systemd service..."
sed -e "s|__APP_DIR__|$REPO_ROOT/main-server|" -e "s|__RUN_USER__|$USER|" "$REPO_ROOT/main-server/anime4kzone.service" | sudo tee /etc/systemd/system/anime4kzone.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable anime4kzone

echo_info "Setup complete. Interface: http://$EXTERNAL_IP:$MINISITE_PORT"
echo_info "Create the database and load the schema, if you have not already:"
echo_info "  psql -U \$DB_USER -d \$DB_NAME -f $REPO_ROOT/main-server/db/schema.sql"
echo_info "Start the server: sudo systemctl start anime4kzone"
echo_info "Logs: journalctl -u anime4kzone -f"

