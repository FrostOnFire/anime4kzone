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

# Проверка наличия GitHub токена
if [ -z "$GITHUB_TOKEN" ]; then
    echo_error "Переменная окружения GITHUB_TOKEN не установлена."
    echo "Пожалуйста, установите её перед запуском скрипта:"
    echo "export GITHUB_TOKEN=your_token_here"
    exit 1
fi

# Проверка наличия внешних портов
if [ -z "$EXTERNAL_PORT_SERVER" ] || [ -z "$EXTERNAL_PORT_HTTP" ]; then
    echo_error "Переменные окружения EXTERNAL_PORT_SERVER и/или EXTERNAL_PORT_HTTP не установлены."
    echo "Пожалуйста, установите их перед запуском скрипта:"
    echo "export EXTERNAL_PORT_SERVER=ваш_внешний_порт_server"
    echo "export EXTERNAL_PORT_HTTP=ваш_внешний_порт_http"
    exit 1
fi

echo_info "Обновление системы и установка необходимых пакетов..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip nano git ffmpeg nodejs npm nginx curl

echo_info "Клонирование репозитория..."
git clone https://$GITHUB_TOKEN@github.com/FrostOnFire/video-enhancer.git

echo_info "Установка зависимостей для Real-ESRGAN..."
cd video-enhancer/Real-ESRGAN
pip3 install --no-cache-dir basicsr facexlib gfpgan opencv-python==4.10.0.82 opencv-contrib-python==4.10.0.82 ffmpeg-python
pip3 install --no-cache-dir -r requirements.txt
sudo apt install -y python3
python3 setup.py develop

echo_info "Установка зависимостей для animeWEB..."
cd ../animeWEB
sudo apt install -y nodejs npm
npm install express express-fileupload uuid cors
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts

echo_info "Настройка Nginx..."
cd ..
sudo apt install -y nginx

# Создание конфигурационного файла Nginx с использованием переменных окружения
cat <<EOF | sudo tee /etc/nginx/sites-available/video-enhancer-http.conf
server {
    listen $EXTERNAL_PORT_HTTP;
    # Убираем фиксированный server_name, чтобы Nginx принимал запросы на любой IP
    # server_name 203.0.113.20;
    
    root /video-enhancer/animeWEB/public;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ =404;
    }
    
    # Прокси для сервера
    location /upload {
        proxy_pass http://localhost:$EXTERNAL_PORT_SERVER/upload;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Активируем конфигурацию
sudo ln -sf /etc/nginx/sites-available/video-enhancer-http.conf /etc/nginx/sites-enabled/
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
INDEX_HTML_PATH="/video-enhancer/animeWEB/public/index.html"

# Проверка существования файла
if [ ! -f "$INDEX_HTML_PATH" ]; then
    echo_error "Файл $INDEX_HTML_PATH не найден."
    exit 1
fi

# Путь к script.js
SCRIPT_JS_PATH="/video-enhancer/animeWEB/public/script.js"

# Проверка существования файла
if [ ! -f "$SCRIPT_JS_PATH" ]; then
    echo_error "Файл $SCRIPT_JS_PATH не найден."
    exit 1
fi

# Создание URL для UPLOAD_URL и SERVER_URL
UPLOAD_URL="http://$EXTERNAL_IP:$EXTERNAL_PORT_SERVER/upload"
SERVER_URL="http://$EXTERNAL_IP:$EXTERNAL_PORT_SERVER"

echo_info "Обновление index.html с актуальными UPLOAD_URL..."
# Замена UPLOAD_URL в index.html
sed -i "s|{{UPLOAD_URL}}|$UPLOAD_URL|g" "$INDEX_HTML_PATH"

echo_info "Файл index.html обновлён с новым UPLOAD_URL."

echo_info "Обновление script.js с актуальными SERVER_URL..."
# Замена SERVER_URL в script.js
sed -i "s|const SERVER_URL = '{{SERVER_URL}}';|const SERVER_URL = '$SERVER_URL';|g" "$SCRIPT_JS_PATH"

echo_info "Файл script.js обновлён с новым SERVER_URL."

echo_info "Обновление server.js с актуальными CLIENT_URL..."
# Путь к server.js
SERVER_JS_PATH="/video-enhancer/animeWEB/server.js"

# Проверка существования файла
if [ ! -f "$SERVER_JS_PATH" ]; then
    echo_error "Файл $SERVER_JS_PATH не найден."
    exit 1
fi

# Создание CLIENT_URL
CLIENT_URL="http://$EXTERNAL_IP:$EXTERNAL_PORT_HTTP"

echo_info "Обновление CORS origin в server.js..."
# Замена CLIENT_URL в server.js
sed -i "s|origin: '{{CLIENT_URL}}'|origin: '$CLIENT_URL'|g" "$SERVER_JS_PATH"

echo_info "Файл server.js обновлён с новым CLIENT_URL."

echo_info "Установка завершена. Настройка завершена успешно."

echo_info "Доступ к HTTP сайту осуществляется по адресу: http://$EXTERNAL_IP:$EXTERNAL_PORT_HTTP"
echo_info "Доступ к серверу осуществляется по адресу: http://$EXTERNAL_IP:$EXTERNAL_PORT_SERVER"

echo_info "Запустите ваше Node.js приложение вручную командой:"
echo_info "cd /video-enhancer/animeWEB && node server.js"