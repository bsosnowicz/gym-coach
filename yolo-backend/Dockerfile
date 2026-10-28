FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    YOLO_MODEL=yolov8n-pose.pt \
    YOLO_CONFIDENCE=0.35

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir \
    --index-url "$TORCH_INDEX_URL" \
    --extra-index-url https://pypi.org/simple \
    torch torchvision

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
