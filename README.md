# WorkShift v2

Piattaforma multi-settore per la gestione dei turni lavorativi. Configura i tuoi codici turno, importa file Excel/Word/PDF e visualizza il mese su un calendario interattivo.

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | FastAPI + SQLModel |
| Database | PostgreSQL 16 |
| Deploy | Docker Compose / Render |

---

## Avvio locale (Docker)

```bash
# 1. Copia il file di configurazione
cp .env.example .env

# 2. Avvia tutto
docker compose up -d --build

# 3. Apri nel browser
# Frontend → http://localhost:5173
# Backend docs → http://localhost:8000/docs
```

Le tabelle del database vengono create automaticamente al primo avvio del backend (via SQLModel).

---

## Avvio locale (senza Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Crea il file .env nella cartella backend/
cat > .env << EOF
DATABASE_URL=postgresql://workshift:workshift@localhost:5432/workshift
JWT_SECRET_KEY=dev-secret
UPLOADS_DIR=./uploads
EOF

uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
# Opzionale: crea frontend/.env.local con VITE_API_BASE_URL=http://localhost:8000/api
npm run dev
```

---

## Come importare i turni

Il parser cerca nel file la riga che contiene la **matricola** dell'utente (impostata in fase di registrazione), poi legge i codici turno che seguono.

**Formato atteso** (Excel, Word, PDF):

```
... MR001  M  M  P  N  S  R  M  P  N  S  R  ...
           ↑  giorni 1..31
```

- I codici devono corrispondere a quelli configurati in "Impostazioni → Codici turno"
- Il mese viene rilevato automaticamente dal testo del documento
- Importare lo stesso mese due volte **aggiorna** i dati esistenti (non duplica)

---

## Struttura del progetto

```
workshift/
├── backend/
│   ├── app/
│   │   ├── api/routes.py          # Tutti gli endpoint REST
│   │   ├── core/config.py         # Settings via pydantic-settings
│   │   ├── core/security.py       # JWT + bcrypt
│   │   ├── db/session.py          # Engine SQLModel + get_session
│   │   ├── models/entities.py     # User, ShiftDefinition, ShiftEntry, Upload
│   │   ├── schemas/common.py      # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── auth.py            # get_current_user dependency
│   │   │   ├── dashboard.py       # Aggregazione dati dashboard
│   │   │   └── importer.py        # Parse file → salva ShiftEntry
│   │   ├── utils/
│   │   │   ├── file_parsers.py    # parse_xlsx, parse_docx, parse_pdf
│   │   │   └── shift_defaults.py  # Turni predefiniti per nuovi utenti
│   │   └── main.py                # FastAPI app + lifespan + CORS
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.ts          # Axios + token management
│   │   ├── components/
│   │   │   ├── AuthView.tsx       # Login / Registrazione
│   │   │   ├── CalendarView.tsx   # Calendario mensile interattivo
│   │   │   ├── EditableDayTable.tsx # Tabella turni modificabile
│   │   │   ├── ImportPanel.tsx    # Upload file con drag & drop
│   │   │   ├── SettingsPanel.tsx  # Gestione codici turno
│   │   │   └── UploadsHistory.tsx # Storico import
│   │   ├── pages/App.tsx          # Root con tab navigation
│   │   ├── types/index.ts         # TypeScript types
│   │   └── index.css              # Design system (CSS variables)
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── render.yaml
└── .env.example
```

---

## API Endpoints

| Method | Path | Descrizione |
|---|---|---|
| POST | `/api/auth/register` | Registra nuovo utente |
| POST | `/api/auth/login` | Login, restituisce JWT |
| GET | `/api/dashboard/me` | Dashboard completa utente |
| GET | `/api/settings/shifts` | Lista codici turno |
| PUT | `/api/settings/shifts` | Sostituisce tutti i codici |
| PATCH | `/api/shifts/{id}` | Modifica singolo turno |
| POST | `/api/imports/me` | Importa file turni |
| GET | `/health` | Health check |

Documentazione interattiva: `http://localhost:8000/docs`

---

## Deploy su Render

1. Crea un account su [render.com](https://render.com)
2. Connetti il repository GitHub
3. Render rileva automaticamente `render.yaml`
4. Configura le variabili d'ambiente:
   - `DATABASE_URL` → usa il database Postgres gestito da Render
   - `JWT_SECRET_KEY` → stringa casuale lunga (min 32 caratteri)
   - `CORS_ORIGINS` → URL del frontend statico (es. `https://workshift.onrender.com`)
   - `VITE_API_BASE_URL` → URL del backend (es. `https://workshift-backend.onrender.com/api`)

---

## Note

- Il parsing immagini (PNG/JPG) non è implementato: richiede un provider OCR esterno. Usa PDF/Excel/Word.
- In produzione usa sempre un `JWT_SECRET_KEY` lungo e casuale.
- Il volume `uploads_data` in Docker preserva i file caricati tra i riavvii.
