"""
Audio Spectrogram Web Service
Веб-сервіс для обробки аудіофайлів з GPU-прискоренням
Генерує 2D спектрограми
"""

import os
import asyncio
from io import BytesIO
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
from matplotlib.ticker import ScalarFormatter
from matplotlib.colors import LinearSegmentedColormap
import soundfile as sf
from PIL import Image, ImageEnhance, ImageFilter
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
STATIC_DIR = BASE_DIR / "dist"

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
STATIC_DIR.mkdir(exist_ok=True)

# Статичні файли
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

# Підтримувані формати
SUPPORTED_FORMATS = {'.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

IMAGE_EXT = ".jpg"
IMAGE_FORMAT = "jpeg"
JPEG_QUALITY = 100
JPEG_SUBSAMPLING = 0

FINAL_FIGSIZE = (22.8, 12.8)
FINAL_DPI = 168
PREVIEW_WIDTH_PX = 320
PREVIEW_DPI = 160
PREVIEW_FIGSIZE = (
    PREVIEW_WIDTH_PX / PREVIEW_DPI,
    (PREVIEW_WIDTH_PX / PREVIEW_DPI) * (FINAL_FIGSIZE[1] / FINAL_FIGSIZE[0]),
)
PREVIEW_FONT_SCALE = 0.5
FREQ_MIN_HZ = 0.0
LOG_MIN_HZ = 20.0
LOG_LINTHRESH_HZ = 20.0
LOG_BASE = 10
MEL_LINTHRESH_HZ = 200.0
MEL_LOG_BASE = 10
MEL_TICK_HZ = (20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000)
LOG_TICK_HZ = (20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000)
MEL_BANDS = 384
DB_FLOOR = -120.0
AUTO_FREQ_MAX_DB = -60.0
AUTO_FREQ_MAX_PAD_HZ = 100.0

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


MODE_CONFIGS = {
    "classic": {
        "top_db": None,
        "hop_div": 4,
        "preemphasis": None,
        "vmax_percentile": None,
    },
    "sharp": {
        "top_db": 80,
        "hop_div": 8,
        "preemphasis": 0.97,
        "vmax_percentile": 99.7,
    },
    "sharper": {
        "top_db": 50,
        "hop_div": 16,
        "preemphasis": 0.98,
        "vmax_percentile": 99.5,
    },
}


def get_mode_config(mode: str) -> dict:
    """Повертає параметри для режиму підсилення."""
    return MODE_CONFIGS.get(mode, MODE_CONFIGS["classic"])


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
        spectrogram_db = spectrogram_db - spectrogram_db.max()
        spectrogram_db = cp.maximum(spectrogram_db, DB_FLOOR)

        # Повертаємо на CPU
        return cp.asnumpy(spectrogram_db)
    else:
        # CPU fallback з librosa
        stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length)
        spectrogram_db = librosa.amplitude_to_db(
            np.abs(stft),
            ref=np.max,
            top_db=abs(DB_FLOOR)
        )
        return spectrogram_db


def get_display_bounds(sr: int, scale: str) -> tuple[float, float, float]:
    """Повертає межі частотної осі та fmax для даних."""
    nyquist = sr / 2.0
    display_min = LOG_MIN_HZ if scale in ("log", "mel") else FREQ_MIN_HZ
    display_max = nyquist
    if display_max <= display_min:
        display_max = display_min + 1.0

    fmax_data = min(display_max, nyquist)
    if fmax_data <= display_min:
        fmax_data = display_min + 1.0

    return display_min, display_max, fmax_data


def compute_mel_spectrogram(audio: np.ndarray, sr: int, n_fft: int,
                            hop_length: int, fmin: float, fmax: float,
                            mel_bins: int = MEL_BANDS, htk: bool = True,
                            norm: Optional[str] = None) -> np.ndarray:
    """Обчислення mel-спектрограми з перетворенням у dB."""
    mel_bins = min(mel_bins, n_fft // 2 + 1)
    mel_power = librosa.feature.melspectrogram(
        y=audio,
        sr=sr,
        n_fft=n_fft,
        hop_length=hop_length,
        n_mels=mel_bins,
        fmin=fmin,
        fmax=fmax,
        htk=htk,
        norm=norm,
        power=2.0
    )
    mel_db = librosa.power_to_db(mel_power, ref=np.max, top_db=abs(DB_FLOOR))
    return mel_db


def apply_image_enhancements(img: Image.Image, mode: str = "classic") -> Image.Image:
    """
    Посилення зображення для покращення графіки.
    mode: "classic" - стандартне зображення, "sharp" - посилене, "sharper" - максимально посилене.
    """
    if mode == "classic":
        return img

    try:
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
            img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=3))

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
            img = img.filter(ImageFilter.UnsharpMask(radius=1.8, percent=180, threshold=2))

            # Посилення яскравості
            enhancer_brightness = ImageEnhance.Brightness(img)
            img = enhancer_brightness.enhance(1.1)

    except Exception as e:
        print(f"⚠️ Помилка при посиленні зображення: {e}")

    return img


def render_spectrogram_figure(
    spectrogram_db: np.ndarray,
    sr: int,
    hop_length: int,
    *,
    colormap: str,
    scale: str,
    vmin: float,
    vmax: float,
    figsize: tuple,
    dpi: int,
    font_scale: float,
    shading: str = "nearest",
    htk: bool = False,
):
    """Створює фігуру спектрограми з узгодженим стилем."""
    fig, ax = plt.subplots(figsize=figsize, dpi=dpi)

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
        "log": "hz",
        "mel": "mel",
    }
    y_axis = y_axis_map.get(scale, "hz")

    display_min, display_max, fmax_data = get_display_bounds(sr, scale)

    if scale in ("linear", "log") and AUTO_FREQ_MAX_DB is not None:
        n_fft = 2 * (spectrogram_db.shape[0] - 1)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        max_db = np.max(spectrogram_db, axis=1)
        valid = np.where(max_db > AUTO_FREQ_MAX_DB)[0]
        if valid.size:
            auto_max = freqs[valid[-1]] + AUTO_FREQ_MAX_PAD_HZ
            display_max = min(display_max, auto_max)
            if display_max <= display_min:
                display_max = min(fmax_data, display_min + 1.0)
            fmax_data = min(fmax_data, display_max)

    img = librosa.display.specshow(
        spectrogram_db,
        sr=sr,
        hop_length=hop_length,
        x_axis='time',
        y_axis=y_axis,
        cmap=cmap,
        vmin=vmin,
        vmax=vmax,
        fmin=display_min,
        fmax=fmax_data,
        shading=shading,
        antialiased=False,
        htk=htk,
        ax=ax
    )

    label_size = max(5, int(round(12 * font_scale)))
    title_size = max(6, int(round(14 * font_scale)))
    tick_size = max(5, int(round(10 * font_scale)))
    cbar_tick_size = max(5, int(round(9 * font_scale)))
    cbar_label_size = max(5, int(round(10 * font_scale)))
    title_pad = max(3, int(round(10 * font_scale)))

    # Встановлення labels осей
    y_label_map = {
        "linear": "Frequency (Hz)",
        "log": "Frequency (Hz, pseudo log)",
        "mel": "Mel Spectrogram (HTK, Hz)",
        "bark": "Bark frequency"
    }
    y_label = y_label_map.get(scale, "Frequency (Hz)")

    ax.set_xlabel('Time (s)', fontsize=label_size, color='white')
    ax.set_ylabel(y_label, fontsize=label_size, color='white')
    ax.set_title('Audio Spectrogram', fontsize=title_size, color='white', pad=title_pad)

    # Стилізація
    fig.patch.set_facecolor('#0d0221')
    ax.set_facecolor('#0d0221')
    ax.tick_params(colors='white', labelsize=tick_size)
    for spine in ax.spines.values():
        spine.set_color('#415a77')

    if scale == "log":
        ax.set_yscale('symlog', linthresh=LOG_LINTHRESH_HZ, base=LOG_BASE)
    elif scale == "mel":
        ax.set_yscale('symlog', linthresh=MEL_LINTHRESH_HZ, base=MEL_LOG_BASE)

    axis_min = display_min
    axis_max = display_max

    ax.set_ylim(axis_min, axis_max)

    if scale == "log":
        ticks = [tick for tick in LOG_TICK_HZ if display_min <= tick <= display_max]
        if not ticks:
            ticks = [display_min, display_max]
        ax.set_yticks(sorted(set(round(tick, 6) for tick in ticks)))
        formatter = ScalarFormatter()
        formatter.set_scientific(False)
        formatter.set_useOffset(False)
        ax.yaxis.set_major_formatter(formatter)
    elif scale == "mel":
        ticks = [tick for tick in MEL_TICK_HZ if display_min <= tick <= display_max]
        if not ticks:
            ticks = [display_min, display_max]
        ax.set_yticks(sorted(set(round(tick, 6) for tick in ticks)))
        formatter = ScalarFormatter()
        formatter.set_scientific(False)
        formatter.set_useOffset(False)
        ax.yaxis.set_major_formatter(formatter)
    else:
        ticks = [tick for tick in ax.get_yticks() if display_min <= tick <= display_max]
        if not ticks:
            ticks = [display_min, display_max]
        ax.set_yticks(sorted(set(round(tick, 6) for tick in ticks)))

    # Кольорова шкала
    cbar = fig.colorbar(img, ax=ax, format='%+2.0f dB')
    cbar.ax.yaxis.set_tick_params(color='white', labelsize=cbar_tick_size)
    cbar.outline.set_edgecolor('#415a77')
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='white')
    cbar.set_label('Intensity (dB)', color='white', fontsize=cbar_label_size)

    plt.tight_layout()
    return fig


def save_figure_image(fig: plt.Figure, output_path: str, mode: str) -> None:
    """Зберігає фігуру в потрібний формат з одним JPEG-кодуванням."""
    buffer = BytesIO()
    fig.savefig(
        buffer,
        format="png",
        facecolor=fig.get_facecolor(),
        edgecolor='none',
        bbox_inches='tight'
    )
    plt.close(fig)
    buffer.seek(0)
    img = Image.open(buffer)
    img.load()
    buffer.close()

    if IMAGE_FORMAT == "jpeg":
        img = img.convert("RGB")

    img = apply_image_enhancements(img, mode)

    if IMAGE_FORMAT == "jpeg":
        img.save(
            output_path,
            format="JPEG",
            quality=JPEG_QUALITY,
            subsampling=JPEG_SUBSAMPLING,
            optimize=False
        )
    else:
        img.save(output_path, format="PNG", optimize=False)


def generate_2d_spectrogram(audio_path: str, output_path: str,
                            colormap: str = "magma", scale: str = "linear", n_fft: int = 2048,
                            mode: str = "classic", use_gpu: bool = True) -> dict:
    """
    Генерація 2D спектрограми та збереження як JPEG
    scale: "linear", "log", "mel"
    n_fft: FFT size (1024, 2048, 4096, 8192, 16384)
    mode: "classic", "sharp", "sharper" - динамічний діапазон
    use_gpu: використовувати GPU обробку якщо доступна
    """
    # Завантаження аудіо
    audio, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=audio, sr=sr)

    mode_config = get_mode_config(mode)

    # Обчислення спектрограми
    hop_length = max(1, n_fft // mode_config["hop_div"])
    if mode_config["preemphasis"] is not None:
        audio = librosa.effects.preemphasis(audio, coef=mode_config["preemphasis"])
    display_min, _, fmax_data = get_display_bounds(sr, scale)
    shading = "nearest"
    htk = False
    if scale == "mel":
        spectrogram_db = compute_mel_spectrogram(
            audio,
            sr,
            n_fft,
            hop_length,
            display_min,
            fmax_data
        )
        shading = "gouraud"
        htk = True
    else:
        spectrogram_db = compute_spectrogram_gpu(audio, sr, n_fft, hop_length, use_gpu)

    # Контроль динамічного діапазону залежно від Mode
    vmax = spectrogram_db.max()
    vmax_percentile = mode_config["vmax_percentile"]
    if vmax_percentile is not None:
        vmax = np.percentile(spectrogram_db, vmax_percentile)

    if mode_config["top_db"] is not None:
        vmin = vmax - mode_config["top_db"]
    else:
        vmin = spectrogram_db.min()
    vmin = min(vmin, DB_FLOOR)
    spectrogram_db = np.maximum(spectrogram_db, vmin)

    fig = render_spectrogram_figure(
        spectrogram_db,
        sr,
        hop_length,
        colormap=colormap,
        scale=scale,
        vmin=vmin,
        vmax=vmax,
        figsize=FINAL_FIGSIZE,
        dpi=FINAL_DPI,
        font_scale=1.0,
        shading=shading,
        htk=htk
    )
    save_figure_image(fig, output_path, mode)

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
    Генерація невеликого превʼю спектрограми (320px ширини) у JPEG
    Швидша версія для реального часу
    mode: "classic", "sharp", "sharper" - динамічний діапазон
    use_gpu: використовувати GPU обробку якщо доступна
    """
    # Завантаження аудіо
    audio, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=audio, sr=sr)

    mode_config = get_mode_config(mode)

    # Обчислення спектрограми
    hop_length = max(1, n_fft // mode_config["hop_div"])
    if mode_config["preemphasis"] is not None:
        audio = librosa.effects.preemphasis(audio, coef=mode_config["preemphasis"])
    display_min, _, fmax_data = get_display_bounds(sr, scale)
    shading = "nearest"
    htk = False
    if scale == "mel":
        spectrogram_db = compute_mel_spectrogram(
            audio,
            sr,
            n_fft,
            hop_length,
            display_min,
            fmax_data
        )
        shading = "gouraud"
        htk = True
    else:
        spectrogram_db = compute_spectrogram_gpu(audio, sr, n_fft, hop_length, use_gpu)

    # Контроль динамічного діапазону залежно від Mode
    vmax = spectrogram_db.max()
    vmax_percentile = mode_config["vmax_percentile"]
    if vmax_percentile is not None:
        vmax = np.percentile(spectrogram_db, vmax_percentile)

    if mode_config["top_db"] is not None:
        vmin = vmax - mode_config["top_db"]
    else:
        vmin = spectrogram_db.min()
    vmin = min(vmin, DB_FLOOR)
    spectrogram_db = np.maximum(spectrogram_db, vmin)

    fig = render_spectrogram_figure(
        spectrogram_db,
        sr,
        hop_length,
        colormap=colormap,
        scale=scale,
        vmin=vmin,
        vmax=vmax,
        figsize=PREVIEW_FIGSIZE,
        dpi=PREVIEW_DPI,
        font_scale=PREVIEW_FONT_SCALE,
        shading=shading,
        htk=htk
    )
    save_figure_image(fig, output_path, mode)

    return {
        "duration": round(duration, 2),
        "sample_rate": sr,
        "frequency_bins": spectrogram_db.shape[0],
        "time_frames": spectrogram_db.shape[1]
    }



async def process_audio_task(task_id: str, audio_path: str, original_stem: str,
                             colormap: str, scale: str, fft_size: int, mode: str = "classic", use_gpu: bool = True):
    """Асинхронна обробка аудіо"""
    try:
        tasks_status[task_id]["status"] = "processing"
        tasks_status[task_id]["message"] = "Обробка аудіо..."
        tasks_status[task_id]["progress"] = 10

        safe_stem = Path(original_stem).stem or "audio"
        output_2d = OUTPUT_DIR / f"{task_id}_{safe_stem}_2d{IMAGE_EXT}"

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

    if fft_size not in [1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    # Генерація ID завдання (на основі таймстемпу)
    task_id = generate_task_id()

    # Збереження файлу
    file_ext = Path(file.filename).suffix
    original_stem = Path(file.filename).stem or "audio"
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
        original_stem,
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

    if fft_size not in [1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    try:
        # Збереження тимчасового файлу
        temp_id = generate_task_id()
        temp_path = UPLOAD_DIR / f"{temp_id}{Path(file.filename).suffix}"

        # Генерація унікального імені файлу на основі параметрів
        params_hash = generate_preview_hash(colormap, scale, fft_size, mode)
        preview_path = OUTPUT_DIR / f"{temp_id}_{params_hash}_preview{IMAGE_EXT}"

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

    if fft_size not in [1024, 2048, 4096, 8192, 16384]:
        raise HTTPException(status_code=400, detail="FFT Size має бути 1024, 2048, 4096, 8192 або 16384")

    if mode not in ["classic", "sharp", "sharper"]:
        raise HTTPException(status_code=400, detail="Mode має бути 'classic', 'sharp' або 'sharper'")

    try:
        # Збереження тимчасового файлу
        temp_id = generate_task_id()
        temp_path = UPLOAD_DIR / f"{temp_id}{Path(file.filename).suffix}"
        output_path = OUTPUT_DIR / f"{temp_id}_4k{IMAGE_EXT}"

        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Генерація 4K спектрограми
        generate_2d_spectrogram(str(temp_path), str(output_path), colormap, scale, fft_size, mode, use_gpu)

        # Очищення тимчасового файлу
        os.remove(temp_path)

        # Повернення файлу для завантаження
        media_type = "image/jpeg" if IMAGE_FORMAT == "jpeg" else "image/png"
        return FileResponse(
            path=str(output_path),
            filename=f"spectrogram_4k_{temp_id}{IMAGE_EXT}",
            media_type=media_type
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Помилка генерації 4K: {str(e)}")


@app.get("/api/download/{filename}")
async def download_file(filename: str):
    """Завантаження результату"""
    file_path = OUTPUT_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не знайдено")

    lower_name = filename.lower()
    if lower_name.endswith((".jpg", ".jpeg")):
        media_type = "image/jpeg"
    elif lower_name.endswith(".png"):
        media_type = "image/png"
    else:
        media_type = "application/octet-stream"
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
