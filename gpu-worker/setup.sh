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

# Проверка наличия внешнего порта сервера
if [ -z "$EXTERNAL_PORT_SERVER" ]; then
    echo_error "Переменная окружения EXTERNAL_PORT_SERVER не установлена."
    echo "Пожалуйста, установите её перед запуском скрипта:"
    echo "export EXTERNAL_PORT_SERVER=ваш_внешний_порт_server"
    exit 1
fi

echo_info "Обновление системы и установка необходимых пакетов..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3-pip nano git ffmpeg nodejs npm curl

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
npm install express express-fileupload uuid cors redis axios
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts

echo_info "Получение внешнего IP адреса сервера..."
EXTERNAL_IP=$(curl -s ifconfig.me)
if [ -z "$EXTERNAL_IP" ]; then
    echo_error "Не удалось получить внешний IP адрес."
    exit 1
fi

echo_info "Внешний IP адрес: $EXTERNAL_IP"

echo_info "Обновление server.js для разрешения CORS от любых источников..."
# Путь к server.js
SERVER_JS_PATH="server.js"

# Проверка существования файла
if [ ! -f "$SERVER_JS_PATH" ]; then
    echo_error "Файл $SERVER_JS_PATH не найден."
    exit 1
fi

# Замена CORS origin в server.js на '*'
sed -i "s|origin: '{{CLIENT_URL}}'|origin: '*',|g" "$SERVER_JS_PATH"

echo_info "Файл server.js обновлён для разрешения CORS от любых источников."

# Добавление замены строки в degradations.py
echo_info "Исправление импорта rgb_to_grayscale в degradations.py..."
DEGRADATIONS_FILE="/usr/local/lib/python3.8/dist-packages/basicsr/data/degradations.py"
if [ -f "$DEGRADATIONS_FILE" ]; then
    sed -i "s|from torchvision.transforms.functional_tensor import rgb_to_grayscale|from torchvision.transforms.functional import rgb_to_grayscale|g" "$DEGRADATIONS_FILE"
    echo_info "Импорт в degradations.py успешно исправлен."
else
    echo_error "Файл $DEGRADATIONS_FILE не найден."
    exit 1
fi

echo_info "Установка завершена. Настройка завершена успешно."

echo_info "Доступ к серверу осуществляется по адресу: http://$EXTERNAL_IP:$EXTERNAL_PORT_SERVER"

echo_info "Запустите ваше Node.js приложение вручную командой:"
echo_info "cd video-enhancer/animeWEB && node server.js"