# WorkShift

Piattaforma multi-settore per gestione turni, configurabile da dashboard.

## Cosa include
- autenticazione utente
- PostgreSQL
- settings turni personalizzabili
- import file Excel, Word e PDF
- dashboard con ruota 3D dei giorni
- correzione manuale dei turni
- Docker e Render config

## Avvio locale
```bash
docker compose up -d --build
```

Frontend: http://localhost:5173
Backend: http://localhost:8000/docs

## Note importanti
Questa build è una base forte e vendibile come prodotto iniziale, ma non posso garantire onestamente “zero modifiche future” o “nessuna incertezza di funzionamento” per qualsiasi file immagine reale. Ho quindi privilegiato una pipeline robusta su PDF/Word/Excel e lasciato il parsing immagini come estensione dedicata da attivare con un OCR specialistico.

## Deploy Render
- backend: Web Service usando `backend/Dockerfile`
- frontend: Static Site usando `frontend` con `npm install && npm run build`
- database: Postgres gestito Render
