#!/bin/bash

# Останавливаем выполнение скрипта при ошибке
set -e

# Функции для вывода сообщений
function echo_info {
    echo -e "\e[32m[INFO]\e[0m $1"
}

function echo_error {
    echo -e "\e[31m[ERROR]\e[0m $1"
}

# Проверка наличия необходимых переменных окружения
if [ -z "$GITHUB_TOKEN" ]; then
    echo_error "Переменная окружения GITHUB_TOKEN не установлена."
    echo "Пожалуйста, установите её перед запуском скрипта:"
    echo "export GITHUB_TOKEN=your_token_here"
    exit 1
fi

# Порт для мини-сайта (по умолчанию 8080, если не задан)
MINISITE_PORT=${MINISITE_PORT:-8080}

echo_info "Обновление системы и установка необходимых пакетов..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx curl build-essential nodejs npm ufw

echo_info "Клонирование репозитория..."
cd /
git clone https://$GITHUB_TOKEN@github.com/FrostOnFire/anime4kzone.git

echo_info "Установка зависимостей для приложения..."
cd /anime4kzone
npm install express express-fileupload uuid cors redis axios pg dotenv

echo_info "Настройка Nginx..."
sudo rm -f /etc/nginx/sites-enabled/default

# Создание конфигурационного файла Nginx
sudo tee /etc/nginx/sites-available/anime4kzone.conf > /dev/null <<EOF
server {
    listen $MINISITE_PORT;
    server_name _;

    root /anime4kzone/public;
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

echo_info "Получение внешнего IPv4 адреса сервера..."
EXTERNAL_IP=$(curl -4 -s ifconfig.me)
if [ -z "$EXTERNAL_IP" ]; then
    echo_error "Не удалось получить внешний IPv4 адрес."
    exit 1
fi

echo_info "Внешний IP адрес: $EXTERNAL_IP"


echo_info "Открытие порта $MINISITE_PORT в брандмауэре..."
# Проверяем, активирован ли ufw
UFW_STATUS=$(sudo ufw status | grep -o "Status: active" || true)

if [ -z "$UFW_STATUS" ]; then
    echo_info "Брандмауэр UFW не активирован. Активируем UFW..."
    sudo ufw enable
fi

sudo ufw allow $MINISITE_PORT
sudo ufw allow 22/tcp
sudo ufw reload

echo_info "Настройка завершена. Интерфейс: http://$EXTERNAL_IP:$MINISITE_PORT"
echo_info "Запуск сервера: cd /anime4kzone && node mainserver.js"

