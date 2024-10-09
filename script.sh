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

    location /uploads/ {
        proxy_pass http://localhost:9090/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /upload {
        proxy_pass http://localhost:9090/upload;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /update-job {
        proxy_pass http://localhost:9090/update-job;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/anime4kzone.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

echo_info "Получение внешнего IP адреса сервера..."
EXTERNAL_IP=$(curl -s ifconfig.me)
if [ -z "$EXTERNAL_IP" ]; then
    echo_error "Не удалось получить внешний IP адрес."
    exit 1
fi

echo_info "Внешний IP адрес: $EXTERNAL_IP"

# Путь к index.html
INDEX_HTML_PATH="/anime4kzone/public/index.html"

# Проверка существования файла
if [ ! -f "$INDEX_HTML_PATH" ]; then
    echo_error "Файл $INDEX_HTML_PATH не найден."
    exit 1
fi

# Путь к script.js
SCRIPT_JS_PATH="/anime4kzone/public/script.js"

# Проверка существования файла
if [ ! -f "$SCRIPT_JS_PATH" ]; then
    echo_error "Файл $SCRIPT_JS_PATH не найден."
    exit 1
fi

# Создание URL для UPLOAD_URL и SERVER_URL
UPLOAD_URL="http://$EXTERNAL_IP:$MINISITE_PORT/upload"
SERVER_URL="http://$EXTERNAL_IP:$MINISITE_PORT"

echo_info "Обновление index.html с актуальным UPLOAD_URL..."
# Замена UPLOAD_URL в index.html
sed -i "s|{{UPLOAD_URL}}|$UPLOAD_URL|g" "$INDEX_HTML_PATH"

echo_info "Файл index.html обновлён с новым UPLOAD_URL."

echo_info "Обновление script.js с актуальным SERVER_URL..."
# Замена SERVER_URL в script.js
sed -i "s|const SERVER_URL = '{{SERVER_URL}}';|const SERVER_URL = '$SERVER_URL';|g" "$SCRIPT_JS_PATH"

echo_info "Файл script.js обновлён с новым SERVER_URL."

echo_info "Обновление mainserver.js с актуальным CLIENT_URL..."
# Путь к mainserver.js
SERVER_JS_PATH="/anime4kzone/mainserver.js"

# Проверка существования файла
if [ ! -f "$SERVER_JS_PATH" ]; then
    echo_error "Файл $SERVER_JS_PATH не найден."
    exit 1
fi

# Создание CLIENT_URL
CLIENT_URL="http://$EXTERNAL_IP:$MINISITE_PORT"

echo_info "Обновление CORS origin в mainserver.js..."
# Замена CLIENT_URL в mainserver.js
sed -i "s|origin: '{{CLIENT_URL}}'|origin: '$CLIENT_URL'|g" "$SERVER_JS_PATH"

echo_info "Файл mainserver.js обновлён с новым CLIENT_URL."

echo_info "Открытие порта $MINISITE_PORT в брандмауэре..."
sudo ufw allow $MINISITE_PORT
sudo ufw reload

echo_info "Настройка завершена. Вы можете запустить ваше Node.js приложение вручную командой:"
echo_info "cd /anime4kzone && node mainserver.js"

echo_info "Доступ к мини-сайту осуществляется по адресу: http://$EXTERNAL_IP:$MINISITE_PORT"