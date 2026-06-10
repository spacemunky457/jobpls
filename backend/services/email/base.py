from abc import ABC, abstractmethod
from settings import settings


class EmailSender(ABC):
    @abstractmethod
    def send(self, to: str, subject: str, html: str) -> None:
        ...


def get_sender(config: dict | None = None) -> EmailSender:
    """Build the email sender from the user's per-user config (falling back to the
    global env settings). Provider: console (dev) | smtp (Gmail etc.) | resend."""
    config = config or {}
    provider = (config.get("EMAIL_PROVIDER") or settings.EMAIL_PROVIDER or "console").lower()

    if provider == "smtp":
        from services.email.smtp_sender import SmtpSender
        return SmtpSender(
            host=config.get("SMTP_HOST", "smtp.gmail.com"),
            port=int(config.get("SMTP_PORT") or 587),
            user=config.get("SMTP_USER", ""),
            password=config.get("SMTP_PASSWORD", ""),
            from_addr=config.get("EMAIL_FROM") or config.get("SMTP_USER", ""),
        )
    if provider == "resend":
        from services.email.resend_sender import ResendSender
        return ResendSender(
            api_key=config.get("RESEND_API_KEY") or settings.RESEND_API_KEY,
            from_addr=config.get("EMAIL_FROM") or settings.EMAIL_FROM,
        )
    from services.email.console_sender import ConsoleSender
    return ConsoleSender()
