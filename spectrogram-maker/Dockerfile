# Audio Spectrogram Service Dockerfile
# =====================================

FROM python:3.11-slim

# Встановлення системних залежностей
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Робоча директорія
WORKDIR /app

# Копіювання залежностей
COPY requirements.txt .

# Встановлення Python пакетів
RUN pip install --no-cache-dir -r requirements.txt

# Копіювання коду
COPY . .

# Створення директорій
RUN mkdir -p uploads outputs

# Порт
EXPOSE 8000

# Запуск
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
