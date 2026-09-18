"""Quick check that the GPU is visible to PyTorch before running any jobs."""

import torch

if torch.cuda.is_available():
    print(f"CUDA available: {torch.cuda.get_device_name(0)}")
    print(f"CUDA version:   {torch.version.cuda}")
else:
    print("CUDA not available. Real-ESRGAN would fall back to CPU and crawl.")
    raise SystemExit(1)
