#!/bin/bash
#
# Provisions the GPU node (PC-3): system packages, Real-ESRGAN and the worker.
# Run it from a checkout of this repository:
#
#   git clone <this repo> && cd anime4kzone/gpu-worker && ./setup.sh
#
# Tested on Ubuntu with an NVIDIA GPU and CUDA drivers already installed.

set -e

function echo_info {
    echo -e "\e[32m[INFO]\e[0m $1"
}

function echo_error {
    echo -e "\e[31m[ERROR]\e[0m $1"
}

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
REALESRGAN_DIR="${REALESRGAN_DIR:-$REPO_ROOT/Real-ESRGAN}"
REALESRGAN_VERSION="${REALESRGAN_VERSION:-v0.3.0}"

echo_info "Installing system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip git ffmpeg nodejs npm curl

echo_info "Installing Real-ESRGAN $REALESRGAN_VERSION into $REALESRGAN_DIR..."
if [ ! -d "$REALESRGAN_DIR" ]; then
    git clone https://github.com/xinntao/Real-ESRGAN.git "$REALESRGAN_DIR"
fi
cd "$REALESRGAN_DIR"
git checkout "$REALESRGAN_VERSION"
pip3 install --no-cache-dir basicsr facexlib gfpgan ffmpeg-python \
    opencv-python==4.10.0.82 opencv-contrib-python==4.10.0.82
pip3 install --no-cache-dir -r requirements.txt
python3 setup.py develop

# basicsr still imports rgb_to_grayscale from torchvision.transforms.functional_tensor,
# which newer torchvision removed. Without this patch every inference run dies on import.
echo_info "Patching the basicsr / torchvision import..."
BASICSR_DIR=$(python3 -c "import basicsr, os; print(os.path.dirname(basicsr.__file__))")
DEGRADATIONS_FILE="$BASICSR_DIR/data/degradations.py"
if [ -f "$DEGRADATIONS_FILE" ]; then
    sed -i "s|from torchvision.transforms.functional_tensor import rgb_to_grayscale|from torchvision.transforms.functional import rgb_to_grayscale|g" "$DEGRADATIONS_FILE"
    echo_info "Patched $DEGRADATIONS_FILE"
else
    echo_error "$DEGRADATIONS_FILE not found — check the basicsr install."
    exit 1
fi

echo_info "Installing worker dependencies..."
cd "$REPO_ROOT/gpu-worker"
npm install

echo_info "Verifying that the GPU is visible to PyTorch..."
python3 check_gpu.py

if [ ! -f "$REPO_ROOT/gpu-worker/.env" ]; then
    echo_error "No .env yet. Copy .env.example to .env and point REDIS_URL and"
    echo_error "MAIN_SERVER_URL at the main server before starting the worker."
fi

echo_info "Installing the systemd service..."
sed -e "s|__APP_DIR__|$REPO_ROOT/gpu-worker|" -e "s|__RUN_USER__|$USER|" "$REPO_ROOT/gpu-worker/anime4kzone-worker.service" | sudo tee /etc/systemd/system/anime4kzone-worker.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable anime4kzone-worker

echo_info "Setup complete. Start the worker with:"
echo_info "  sudo systemctl start anime4kzone-worker"
echo_info "Logs: journalctl -u anime4kzone-worker -f"
