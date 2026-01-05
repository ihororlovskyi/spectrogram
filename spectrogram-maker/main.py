"""
Audio Spectrogram Web Service
Веб-сервіс для обробки аудіофайлів з GPU-прискоренням
Генерує 2D спектрограми
"""

import os
import asyncio
from pathlib import Path
from typing import Optional
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import librosa
import librosa.display
import matplotlib
matplotlib.use('Agg')  # Для серверного рендерингу
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import soundfile as sf
from PIL import Image, ImageEnhance
from pydantic import BaseModel
from datetime import datetime, timedelta
import shutil
import time
import hashlib

# Спроба використати CuPy для GPU обробки
try:
    import cupy as cp
    GPU_AVAILABLE = True
    print("✓ GPU (CuPy) доступний для обробки")
except ImportError:
    cp = np
    GPU_AVAILABLE = False
    print("✗ GPU недоступний, використовується CPU (NumPy)")

# Налаштування додатку
app = FastAPI(
    title="Audio Spectrogram Service",
    description="Веб-сервіс для генерації 2D спектрограм з GPU-прискоренням",
    version="1.0.0"
)

# CORS для фронтенду
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Директорії
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "outputs"
STATIC_DIR = BASE_DIR / "static"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

# Статичні файли
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

# Підтримувані формати
SUPPORTED_FORMATS = {'.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

# Зберігання статусів завдань
tasks_status = {}


class TaskStatus(BaseModel):
    task_id: str
    status: str  # pending, processing, completed, error
    progress: int
    message: str
    result: Optional[dict] = None


def validate_audio_file(filename: str) -> bool:
    """Валідація формату аудіофайлу"""
    ext = Path(filename).suffix.lower()
    return ext in SUPPORTED_FORMATS


def generate_task_id() -> str:
    """Генерація унікального ID на основі таймстемпу"""
    return str(int(time.time() * 1000))


def generate_preview_hash(colormap: str, scale: str, fft_size: int, mode: str) -> str:
    """Генерація хешу на основі параметрів превʼю"""
    params = f"{colormap}_{scale}_{fft_size}_{mode}"
    return hashlib.md5(params.encode()).hexdigest()[:8]


def compute_spectrogram_gpu(audio: np.ndarray, sr: int, n_fft: int = 2048,
                            hop_length: int = 512, use_gpu: bool = True) -> np.ndarray:
    """
    Обчислення спектрограми з використанням GPU (якщо доступний)
    use_gpu: якщо True - намагаємось використати GPU, якщо False - завжди CPU
    """
    if GPU_AVAILABLE and use_gpu:
        # Переносимо дані на GPU
        audio_gpu = cp.asarray(audio)

        # STFT на GPU
        n_frames = 1 + (len(audio_gpu) - n_fft) // hop_length
        stft_matrix = cp.zeros((n_fft // 2 + 1, n_frames), dtype=cp.complex64)

        window = cp.hanning(n_fft).astype(cp.float32)

        for i in range(n_frames):
            start = i * hop_length
            frame = audio_gpu[start:start + n_fft]
            if len(frame) < n_fft:
                frame = cp.pad(frame, (0, n_fft - len(frame)))
            windowed = frame * window
            spectrum = cp.fft.rfft(windowed)
            stft_matrix[:, i] = spectrum

        # Перетворення у децибели
        magnitude = cp.abs(stft_matrix)
        spectrogram_db = 20 * cp.log10(cp.maximum(magnitude, 1e-10))

        # Повертаємо на CPU
        return cp.asnumpy(spectrogram_db)
    else:
        # CPU fallback з librosa
        stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
        spectrogram_db = librosa.amplitude_to_db(np.abs(stft), ref=np.max)
        return spectrogram_db


def enhance_image(image_path: str, mode: str = "classic"):
    """
    Посилення зображення для покращення графіки
    mode: "classic" - стандартне зображення, "sharp" - посилене, "sharper" - максимально посилене
    """
    if mode == "classic":
        return

    try:
        img = Image.open(image_path)

        if mode == "sharp":
            # Посилення контрастності
            enhancer_contrast = ImageEnhance.Contrast(img)
            img = enhancer_contrast.enhance(1.3)

            # Посилення насиченості
            enhancer_color = ImageEnhance.Color(img)
            img = enhancer_color.enhance(1.2)

            # Легке посилення різкості
            enhancer_sharpness = ImageEnhance.Sharpness(img)
            img = enhancer_sharpness.enhance(1.5)

        elif mode == "sharper":
            # Максимальне посилення контрастності
            enhancer_contrast = ImageEnhance.Contrast(img)
            img = enhancer_contrast.enhance(1.6)

            # Максимальне посилення насиченості
            enhancer_color = ImageEnhance.Color(img)
            img = enhancer_color.enhance(1.5)

            # Максимальне посилення різкості
            enhancer_sharpness = ImageEnhance.Sharpness(img)
            img = enhancer_sharpness.enhance(2.0)

            # Посилення яскравості
            enhancer_brightness = ImageEnhance.Brightness(img)
            img = enhancer_brightness.enhance(1.1)

        img.save(image_path, quality=95, optimize=False)
    except Exception as e:
        print(f"⚠️ Помилка при посиленні зображення: {e}")


def generate_2d_spectrogram(audio_path: str, output_path: str,
                            colormap: str = "magma", scale: str = "linear", n_fft: int = 2048,
                            mode: str = "classic", use_gpu: bool = True) -> dict:
    """
    Генерація 2D спектрограми та збереження як PNG
    scale: "linear", "log", "mel"
    n_fft: FFT size (256, 512, 1024, 2048, 4096, 8192, 16384)
    mode: "classic", "sharp", "sharper" - динамічний діапазон
    use_gpu: використовувати GPU обробку якщо доступна
    """
    # Завантаження аудіо
    audio, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=audio, sr=sr)

    # Обчислення спектрограми
    hop_length = n_fft // 4
    spectrogram_db = compute_spectrogram_gpu(audio, sr, n_fft, hop_length, use_gpu)

    # Контроль динамічного діапазону залежно від Mode
    mode_top_db = {
        "classic": None,    # Вся шкала - не обрізаємо
        "sharp": 80,        # Стандартний діапазон
        "sharper": 50       # Вузький діапазон для максимальної контрастності
    }
    top_db = mode_top_db.get(mode, None)

    # Застосування top_db для нормалізації
    if top_db is not None:
        spectrogram_db = np.maximum(spectrogram_db, spectrogram_db.max() - top_db)

    # Створення візуалізації (4K resolution: 3840x2160)
    fig, ax = plt.subplots(figsize=(22.8, 12.8), dpi=168)

    # Кастомна кольорова карта
    if colormap == "custom":
        colors = ['#0d0221', '#0d1b2a', '#1b263b', '#415a77',
                  '#778da9', '#e0e1dd', '#ff6b6b', '#ffd93d']
        custom_cmap = LinearSegmentedColormap.from_list("audio_spectrum", colors)
        cmap = custom_cmap
    elif colormap == "gray":
        cmap = "gray"
    else:
        cmap = colormap

    # Вибір осі Y залежно від типу масштаба
    y_axis_map = {
        "linear": "hz",
        "log": "log",
        "mel": "mel",
    }
    y_axis = y_axis_map.get(scale, "hz")

    img = librosa.display.specshow(
        spectrogram_db,
        sr=sr,
        hop_length=hop_length,
        x_axis='time',
        y_axis=y_axis,
        cmap=cmap,
        ax=ax
    )
    
    # Встановлення labels осей
    y_label_map = {
        "linear": "Частота (Гц)",
        "log": "Частота (Гц, log)",
        "mel": "Mel-частота",
        "bark": "Bark-частота"
    }
    y_label = y_label_map.get(scale, "Частота (Гц)")

    ax.set_xlabel('Час (с)', fontsize=12, color='white')
    ax.set_ylabel(y_label, fontsize=12, color='white')
    ax.set_title('Спектрограма аудіо', fontsize=14, color='white', pad=10)
    
    # Стилізація
    fig.patch.set_facecolor('#0d0221')
    ax.set_facecolor('#0d0221')
    ax.tick_params(colors='white')
    for spine in ax.spines.values():
        spine.set_color('#415a77')
    
    # Кольорова шкала
    cbar = fig.colorbar(img, ax=ax, format='%+2.0f дБ')
    cbar.ax.yaxis.set_tick_params(color='white')
    cbar.outline.set_edgecolor('#415a77')
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='white')
    cbar.set_label('Інтенсивність (дБ)', color='white')
    
    plt.tight_layout()
    plt.savefig(output_path, facecolor=fig.get_facecolor(),
                edgecolor='none', bbox_inches='tight')
    plt.close()

    # Посилення зображення для покращення графіки
    enhance_image(output_path, mode)

    return {
        "duration": round(duration, 2),
        "sample_rate": sr,
        "frequency_bins": spectrogram_db.shape[0],
        "time_frames": spectrogram_db.shape[1]
    }


def generate_2d_preview(audio_path: str, output_path: str,
                       colormap: str = "magma", scale: str = "linear", n_fft: int = 2048,
                       mode: str = "classic", use_gpu: bool = True) -> dict:
    """
    Генерація невеликого превʼю спектрограми (320px ширини)
    Швидша версія для реального часу
    mode: "classic", "sharp", "sharper" - динамічний діапазон
    use_gpu: використовувати GPU обробку якщо доступна
    """
    # Завантаження аудіо
    audio, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=audio, sr=sr)

    # Обчислення спектрограми
    hop_length = n_fft // 4
    spectrogram_db = compute_spectrogram_gpu(audio, sr, n_fft, hop_length, use_gpu)

    # Контроль динамічного діапазону залежно від Mode
    mode_top_db = {
        "classic": None,    # Вся шкала - не обрізаємо
        "sharp": 80,        # Стандартний діапазон
        "sharper": 50       # Вузький діапазон для максимальної контрастності
    }
    top_db = mode_top_db.get(mode, None)

    # Застосування top_db для нормалізації
    if top_db is not None:
        spectrogram_db = np.maximum(spectrogram_db, spectrogram_db.max() - top_db)

    # Створення превʼю (320px ширини = 1.8 дюйми при 176 dpi)
    fig, ax = plt.subplots(figsize=(1.8, 1.012), dpi=176)

    # Кольорова карта
    if colormap == "custom":
        colors = ['#0d0221', '#0d1b2a', '#1b263b', '#415a77',
                  '#778da9', '#e0e1dd', '#ff6b6b', '#ffd93d']
        custom_cmap = LinearSegmentedColormap.from_list("audio_spectrum", colors)
        cmap = custom_cmap
    elif colormap == "gray":
        cmap = "gray"
    else:
        cmap = colormap

    # Вибір осі Y залежно від типу масштаба
    y_axis_map = {
        "linear": "hz",
        "log": "log",
        "mel": "mel",
    }
    y_axis = y_axis_map.get(scale, "hz")

    img = librosa.display.specshow(
        spectrogram_db,
        sr=sr,
        hop_length=hop_length,
        x_axis='time',
        y_axis=y_axis,
        cmap=cmap,
        ax=ax
    )

    ax.set_xlabel('', fontsize=6, color='white')
    ax.set_ylabel('', fontsize=6, color='white')
    ax.tick_params(labelsize=5)

    # Стилізація
    fig.patch.set_facecolor('#0d0221')
    ax.set_facecolor('#0d0221')
    ax.tick_params(colors='white')
    for spine in ax.spines.values():
        spine.set_color('#415a77')

    plt.tight_layout(pad=0.1)
    plt.savefig(output_path, facecolor=fig.get_facecolor(),
                edgecolor='none', bbox_inches='tight', pad_inches=0.02)
    plt.close()

    # Посилення зображення для покращення графіки
    enhance_image(output_path, mode)

    return {
        "duration": round(duration, 2),
        "sample_rate": sr,
        "frequency_bins": spectrogram_db.shape[0],
        "time_frames": spectrogram_db.shape[1]
    }



async def process_audio_task(task_id: str, audio_path: str,
                             colormap: str, scale: str, fft_size: int, mode: str = "classic", use_gpu: bool = True):
    """Асинхронна обробка аудіо"""
    try:
        tasks_status[task_id]["status"] = "processing"
        tasks_status[task_id]["message"] = "Обробка аудіо..."
        tasks_status[task_id]["progress"] = 10

        base_name = Path(audio_path).stem
        output_2d = OUTPUT_DIR / f"{task_id}_{base_name}_2d.png"

        # Генерація 2D спектрограми
        tasks_status[task_id]["message"] = "Генерація 2D спектрограми..."
        tasks_status[task_id]["progress"] = 50
        info_2d = generate_2d_spectrogram(audio_path, str(output_2d), colormap, scale, fft_size, mode, use_gpu)

        # Очищення тимчасового файлу
        tasks_status[task_id]["progress"] = 90
        os.remove(audio_path)

        # Завершення
        tasks_status[task_id]["status"] = "completed"
        tasks_status[task_id]["progress"] = 100
        tasks_status[task_id]["message"] = "Обробка завершена!"

        result = {
            "spectrogram_2d": {
                "url": f"/outputs/{output_2d.name}",
                "filename": output_2d.name,
                **info_2d
            }
        }

        tasks_status[task_id]["result"] = result

    except Exception as e:
        tasks_status[task_id]["status"] = "error"
        tasks_status[task_id]["message"] = f"Помилка: {str(e)}"
        # Очищення при помилці
        if os.path.exists(audio_path):
            os.remove(audio_path)


@app.get("/", response_class=HTMLResponse)
async def root():
    """Головна сторінка"""
    html_path = STATIC_DIR / "index.html"
    if html_path.exists():
        return html_path.read_text(encoding='utf-8')
    return HTMLResponse("<h1>Audio Spectrogram Service</h1><p>Помістіть index.html у папку static</p>")


@app.get("/api/status")
async def get_service_status():
    """Статус сервісу"""
    return {
        "status": "online",
        "gpu_available": GPU_AVAILABLE,
        "supported_formats": list(SUPPORTED_FORMATS),
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024)
    }


@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    colormap: str = "magma",
    scale: str = "linear",
    fft_size: int = 2048,
    mode: str = "classic",
    use_gpu: bool = True
):
    """
    Завантаження аудіофайлу для обробки
    """
    # Валідація
    if not validate_audio_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Непідтримуваний формат. Дозволені: {', '.join(SUPPORTED_FORMATS)}"
        )

    # Перевірка розміру
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл занадто великий. Максимум: {MAX_FILE_SIZE // (1024*1024)} MB"
        )

    # Валідація параметрів
    if scale.lower() not in ["linear", "log", "mel"]:
        raise HTTPException(status_code=400, detail="Масштаб має бути 'linear', 'log' або 'mel'")

    if fft_size not in [256, 512, 1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 256, 512, 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    # Генерація ID завдання (на основі таймстемпу)
    task_id = generate_task_id()

    # Збереження файлу
    file_ext = Path(file.filename).suffix
    temp_path = UPLOAD_DIR / f"{task_id}{file_ext}"

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Ініціалізація статусу
    tasks_status[task_id] = {
        "task_id": task_id,
        "status": "pending",
        "progress": 0,
        "message": "Завдання створено",
        "result": None
    }

    # Запуск фонової обробки
    background_tasks.add_task(
        process_audio_task,
        task_id,
        str(temp_path),
        colormap,
        scale.lower(),
        fft_size,
        mode,
        use_gpu
    )

    return {"task_id": task_id, "message": "Файл завантажено, обробка розпочата"}


@app.post("/api/preview")
async def generate_preview(
    file: UploadFile = File(...),
    colormap: str = "magma",
    scale: str = "linear",
    fft_size: int = 2048,
    mode: str = "classic",
    use_gpu: bool = True
):
    """
    Генерація превʼю спектрограми (320px) для реального часу
    """
    # Логування параметрів
    print(f"📊 Параметри превʼю: colormap={colormap}, scale={scale}, fft_size={fft_size}, mode={mode}")

    # Валідація
    if not validate_audio_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Непідтримуваний формат. Дозволені: {', '.join(SUPPORTED_FORMATS)}"
        )

    # Перевірка розміру
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл занадто великий. Максимум: {MAX_FILE_SIZE // (1024*1024)} MB"
        )

    # Валідація параметрів
    if scale.lower() not in ["linear", "log", "mel"]:
        raise HTTPException(status_code=400, detail="Масштаб має бути 'linear', 'log' або 'mel'")

    if fft_size not in [256, 512, 1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 256, 512, 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    try:
        # Збереження тимчасового файлу
        temp_id = generate_task_id()
        temp_path = UPLOAD_DIR / f"{temp_id}{Path(file.filename).suffix}"

        # Генерація унікального імені файлу на основі параметрів
        params_hash = generate_preview_hash(colormap, scale, fft_size, mode)
        preview_path = OUTPUT_DIR / f"{temp_id}_{params_hash}_preview.png"

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Генерація превʼю
        info = generate_2d_preview(str(temp_path), str(preview_path), colormap, scale, fft_size, mode, use_gpu)

        # Очищення тимчасового файлу
        os.remove(temp_path)

        print(f"✓ Превʼю згенеровано: {preview_path.name}")

        return {
            "preview_url": f"/outputs/{preview_path.name}",
            "filename": preview_path.name,
            **info
        }

    except Exception as e:
        print(f"✗ Помилка генерації превʼю: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Помилка генерації превʼю: {str(e)}")


@app.get("/api/task/{task_id}")
async def get_task_status(task_id: str):
    """Отримання статусу завдання"""
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="Завдання не знайдено")
    return tasks_status[task_id]


@app.post("/api/download-4k")
async def download_4k_spectrogram(
    file: UploadFile = File(...),
    colormap: str = "magma",
    scale: str = "linear",
    fft_size: int = 2048,
    mode: str = "classic",
    use_gpu: bool = True
):
    """
    Генерація та завантаження 4K спектрограми (3840x2160)
    """
    # Валідація
    if not validate_audio_file(file.filename):
        raise HTTPException(
            status_code=400,
            detail=f"Непідтримуваний формат. Дозволені: {', '.join(SUPPORTED_FORMATS)}"
        )

    # Перевірка розміру
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Файл занадто великий. Максимум: {MAX_FILE_SIZE // (1024*1024)} MB"
        )

    # Валідація параметрів
    if scale.lower() not in ["linear", "log", "mel"]:
        raise HTTPException(status_code=400, detail="Масштаб має бути 'linear', 'log' або 'mel'")

    if fft_size not in [256, 512, 1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 256, 512, 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    try:
        # Збереження тимчасового файлу
        temp_id = generate_task_id()
        temp_path = UPLOAD_DIR / f"{temp_id}{Path(file.filename).suffix}"
        output_path = OUTPUT_DIR / f"{temp_id}_4k.png"

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Генерація 4K спектрограми
        generate_2d_spectrogram(str(temp_path), str(output_path), colormap, scale, fft_size, mode, use_gpu)

        # Очищення тимчасового файлу
        os.remove(temp_path)

        # Повернення файлу для завантаження
        return FileResponse(
            path=str(output_path),
            filename=f"spectrogram_4k_{temp_id}.png",
            media_type="image/png"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Помилка генерації 4K: {str(e)}")


@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """Завантаження результату"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не знайдено")
    
    media_type = "image/png" if filename.endswith(".png") else "application/octet-stream"
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type=media_type
    )


@app.delete("/api/cleanup")
async def cleanup_old_files(max_age_hours: int = 24):
    """Очищення старих файлів"""
    cutoff = datetime.now() - timedelta(hours=max_age_hours)
    removed = 0
    
    for directory in [OUTPUT_DIR, UPLOAD_DIR]:
        for file in directory.iterdir():
            if file.is_file():
                mtime = datetime.fromtimestamp(file.stat().st_mtime)
                if mtime < cutoff:
                    file.unlink()
                    removed += 1
    
    return {"removed_files": removed}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
