"""
Image OCR via Hugging Face Inference API.

Usa l'endpoint serverless standard di HF che funziona con qualsiasi token base:
  POST https://api-inference.huggingface.co/v1/chat/completions

NON richiede provider speciali (nebius/novita/together) — solo un HF_TOKEN valido.

Per modelli vision consigliati:
  - Qwen/Qwen2.5-VL-7B-Instruct    (default, ottimo per tabelle)
  - Qwen/Qwen2-VL-7B-Instruct      (alternativa)
  - meta-llama/Llama-3.2-11B-Vision-Instruct (alternativa)

Configurazione .env:
  HF_TOKEN=hf_xxxx   ← obbligatorio
  HF_MODEL=Qwen/Qwen2.5-VL-7B-Instruct   ← opzionale
"""
from __future__ import annotations
import base64, json, logging
from pathlib import Path
import httpx
from app.core.config import get_settings
from app.utils.file_parsers import ParsedMonth

logger = logging.getLogger("workshift.ocr")

# Endpoint serverless standard — funziona con token base senza provider speciali
HF_INFERENCE_URL = "https://api-inference.huggingface.co/v1/chat/completions"

# Modelli fallback in ordine
FALLBACK_MODELS = [
    "Qwen/Qwen2.5-VL-7B-Instruct",
    "Qwen/Qwen2-VL-7B-Instruct",
    "meta-llama/Llama-3.2-11B-Vision-Instruct",
]

PROMPT = """This image shows a monthly work shift schedule table.
Find the row for employee with code/matricola: {employee_code}
Extract the shift code for EACH day of the month.
Common codes: M=Mattina, P=Pomeriggio, N=Notte, S=Smonto, R=Riposo, ASS=Assenza, CO=Congedo, A=Assenza

Reply ONLY with valid JSON (no markdown, no extra text):
{{"month": "marzo", "year": 2026, "days": {{"1": "M", "2": "R", "3": "N"}}}}

Include only days that have a code. Use the exact codes from the image."""


def _try_model(model: str, token: str, b64: str, media_type: str, employee_code: str) -> tuple[bool, str]:
    """
    Try one model on the standard HF inference endpoint.
    Returns (success, content_or_error).
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": 800,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
                {"type": "text", "text": PROMPT.format(employee_code=employee_code)},
            ],
        }],
    }

    logger.info("HF OCR: trying model=%s", model)

    try:
        resp = httpx.post(HF_INFERENCE_URL, json=payload, headers=headers, timeout=120)
    except httpx.TimeoutException:
        return False, f"{model}: timeout (120s)"
    except Exception as e:
        return False, f"{model}: errore di rete: {e}"

    if resp.status_code == 401:
        raise ValueError(
            "HF_TOKEN non valido o mancante.\n"
            "1. Vai su https://huggingface.co/settings/tokens\n"
            "2. Crea un token con permesso 'read'\n"
            "3. Aggiungilo al .env: HF_TOKEN=hf_xxxx"
        )

    if resp.status_code == 503:
        # Model loading — try next
        return False, f"{model}: in caricamento (503), riprova tra qualche secondo"

    if resp.status_code not in (200, 201):
        try:
            err = resp.json()
            msg = err.get("error", resp.text[:150])
        except Exception:
            msg = resp.text[:150]
        logger.warning("HF model %s failed %d: %s", model, resp.status_code, msg)
        return False, f"{model}: {resp.status_code} — {msg}"

    try:
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        logger.info("HF OCR success: model=%s chars=%d", model, len(text))
        return True, text
    except Exception as e:
        return False, f"{model}: errore parsing risposta: {e}"


def _parse_json_response(raw_text: str, employee_code: str) -> ParsedMonth:
    import re as _re

    cleaned = raw_text.strip()
    if "```" in cleaned:
        cleaned = _re.sub(r"```(?:json)?\s*", "", cleaned).replace("```", "").strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"Nessun JSON trovato nella risposta AI. Ricevuto: {raw_text[:200]}")

    try:
        data = json.loads(cleaned[start:end])
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON non valido: {e}. Risposta: {raw_text[:200]}")

    month_name = str(data.get("month", "")).lower().strip()
    year = int(data.get("year", 2026))

    MONTHS = {
        "gennaio":1,"febbraio":2,"marzo":3,"aprile":4,"maggio":5,"giugno":6,
        "luglio":7,"agosto":8,"settembre":9,"ottobre":10,"novembre":11,"dicembre":12,
        "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
        "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    }
    month_num = MONTHS.get(month_name, 0)
    label = f"{month_name.capitalize()} {year}" if month_name else f"Mese sconosciuto {year}"

    days: dict[int, str] = {}
    for day_str, code in data.get("days", {}).items():
        try:
            day = int(day_str)
            code_upper = str(code).upper().strip()
            if 1 <= day <= 31 and code_upper:
                days[day] = code_upper
        except (ValueError, TypeError):
            continue

    if not days:
        raise ValueError(
            f"Nessun turno estratto per matricola '{employee_code}'.\n"
            "Verifica che l'immagine mostri chiaramente la riga con la matricola."
        )

    return ParsedMonth(
        month_label=label, year=year, month=month_num,
        days=days,
        note=f"AI OCR — {len(days)} giorni estratti",
    )


def parse_image_with_ai(path: Path, employee_code: str) -> ParsedMonth:
    settings = get_settings()

    if not settings.hf_token:
        raise ValueError(
            "HF_TOKEN non configurato nel .env.\n"
            "1. Vai su https://huggingface.co/settings/tokens\n"
            "2. Crea token con permesso 'read'\n"
            "3. Aggiungi al .env: HF_TOKEN=hf_xxxx\n"
            "4. Riavvia il backend (docker compose restart backend)"
        )

    image_bytes = path.read_bytes()
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    suffix = path.suffix.lower().lstrip(".")
    media_type = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp",
    }.get(suffix, "image/jpeg")

    # Models to try: configured model first, then fallbacks
    configured = settings.hf_model
    models_to_try = [configured] + [m for m in FALLBACK_MODELS if m != configured]

    errors: list[str] = []
    for model in models_to_try:
        success, result = _try_model(model, settings.hf_token, b64, media_type, employee_code)
        if success:
            parsed = _parse_json_response(result, employee_code)
            parsed.note = f"AI ({model.split('/')[-1]}) — {len(parsed.days)} giorni"
            return parsed
        errors.append(result)

    raise ValueError(
        "Import immagine fallito.\n"
        + "\n".join(f"• {e}" for e in errors[:3])
        + "\n\n💡 Verifica che HF_TOKEN sia valido e che il modello supporti immagini."
    )
