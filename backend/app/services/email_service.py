from __future__ import annotations

import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.core.config import get_settings

logger = logging.getLogger("workshift.email")


def _build_message(to: str, subject: str, html: str) -> MIMEMultipart:
    settings = get_settings()
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    return msg


def send_email(to: str, subject: str, html: str) -> bool:
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP not configured, skipping email to %s", to)
        return False
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_tls:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(
                settings.smtp_from or settings.smtp_user,
                to,
                _build_message(to, subject, html).as_string(),
            )
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.error("Email send failed to %s: %s", to, e)
        return False


def send_password_reset(to: str, full_name: str, reset_url: str) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
      <h2 style="color:#6ee7b7">WorkShift — Reset Password</h2>
      <p>Ciao <strong>{full_name}</strong>,</p>
      <p>Hai richiesto il reset della password. Clicca il pulsante qui sotto entro <strong>30 minuti</strong>.</p>
      <a href="{reset_url}" style="display:inline-block;margin:20px 0;padding:12px 24px;
         background:#6ee7b7;color:#061612;border-radius:8px;font-weight:700;text-decoration:none">
        Reimposta password
      </a>
      <p style="color:#94a3b8;font-size:13px">Se non hai richiesto il reset, ignora questa mail.</p>
      <p style="color:#94a3b8;font-size:13px">Link diretto: {reset_url}</p>
    </div>
    """
    return send_email(to, "WorkShift — Reimposta la tua password", html)


def send_temp_password(to: str, full_name: str, temp_password: str, login_url: str) -> bool:
    html = f"""
    <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
      <h2 style="color:#6ee7b7">WorkShift — Account creato</h2>
      <p>Ciao <strong>{full_name}</strong>,</p>
      <p>Il tuo account WorkShift è stato creato. Usa le credenziali qui sotto per accedere.</p>
      <div style="background:#111827;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:4px 0;color:#94a3b8;font-size:13px">Password temporanea:</p>
        <p style="margin:4px 0;font-size:20px;font-weight:700;color:#6ee7b7;letter-spacing:0.1em">{temp_password}</p>
      </div>
      <p>Al primo accesso ti verrà chiesto di cambiarla.</p>
      <a href="{login_url}" style="display:inline-block;margin:20px 0;padding:12px 24px;
         background:#6ee7b7;color:#061612;border-radius:8px;font-weight:700;text-decoration:none">
        Accedi ora
      </a>
    </div>
    """
    return send_email(to, "WorkShift — Credenziali di accesso", html)


def send_swap_notification(to: str, full_name: str, action: str, details: str, app_url: str) -> bool:
    titles = {
        "new_request": "Nuova richiesta di cambio turno",
        "accepted_target": "Cambio turno accettato — in attesa del manager",
        "rejected_target": "Cambio turno rifiutato",
        "approved_manager": "Cambio turno approvato dal manager",
        "rejected_manager": "Cambio turno non approvato dal manager",
    }
    title = titles.get(action, "Aggiornamento cambio turno")
    html = f"""
    <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px">
      <h2 style="color:#6ee7b7">WorkShift — {title}</h2>
      <p>Ciao <strong>{full_name}</strong>,</p>
      <p>{details}</p>
      <a href="{app_url}" style="display:inline-block;margin:20px 0;padding:12px 24px;
         background:#6ee7b7;color:#061612;border-radius:8px;font-weight:700;text-decoration:none">
        Apri WorkShift
      </a>
    </div>
    """
    return send_email(to, f"WorkShift — {title}", html)
