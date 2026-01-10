# Spectrogram Maker

Web development of Spectrogram Maker - service for converting audio file to 2D spectrogram image file

### Development

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
npm install
npm run dev:all
```

Vite dev server runs on `http://localhost:5173` with API and outputs proxied to `http://localhost:8000`.

### Production build

```bash
npm run build
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Have fun! ;)
