import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger("app.email")


def _render_confirmation_email(name: str, code: str, expires_minutes: int) -> tuple[str, str]:
    text = (
        f"Hola {name},\n\n"
        f"Tu código de confirmación de miMuro es: {code}\n\n"
        f"Vence en {expires_minutes} minutos.\n"
        f"Si no creaste esta cuenta, ignorá este correo.\n\n"
        f"— Equipo miMuro"
    )
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1d1d2b;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">miMuro</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 8px;color:#1d1d2b;font-size:18px;">Hola {name},</h2>
          <p style="margin:0 0 24px;color:#55555f;font-size:15px;">
            recibiste este correo porque creaste una cuenta en miMuro.
            Ingresá el siguiente código para confirmar tu dirección de email:
          </p>
          <p style="margin:0 0 24px;text-align:center;">
            <span style="display:inline-block;background:#f0f0f5;border:2px dashed #7c6cf0;
                         border-radius:10px;padding:16px 32px;font-size:34px;font-weight:bold;
                         letter-spacing:10px;color:#1d1d2b;">{code}</span>
          </p>
          <p style="margin:0 0 8px;color:#55555f;font-size:13px;">
            El código vence en <strong>{expires_minutes} minutos</strong>.
          </p>
          <p style="margin:0;color:#9999a3;font-size:13px;">
            Si no creaste esta cuenta, ignorá este correo.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
    return text, html


def send_confirmation_email(to_email: str, name: str, code: str) -> bool:
    """Envía el código de confirmación por SMTP.

    Si SMTP_HOST no está configurado (modo desarrollo) se imprime el código
    en la consola del backend en lugar de enviar el correo.
    """
    expires = settings.confirmation_code_expire_minutes

    if not settings.smtp_host:
        logger.info("[EMAIL][DEV] Código para %s: %s (vence en %d min)",
                    to_email, code, expires)
        print(f"[EMAIL][DEV] Para: {to_email} — Código de confirmación: {code} "
              f"(vence en {expires} min)", flush=True)
        return True

    text, html = _render_confirmation_email(name, code, expires)
    msg = EmailMessage()
    msg["Subject"] = f"Tu código de confirmación de miMuro: {code}"
    # Se acepta "correo@dom.com" o "Nombre <correo@dom.com>"
    msg["From"] = settings.smtp_from if "<" in settings.smtp_from else formataddr(("miMuro", settings.smtp_from))
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info("Código de confirmación enviado a %s", to_email)
        return True
    except Exception:
        logger.exception("No se pudo enviar el correo a %s", to_email)
        return False
