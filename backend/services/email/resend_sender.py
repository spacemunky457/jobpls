import logging
import resend
from services.email.base import EmailSender
from settings import settings

log = logging.getLogger("jobpls.email")


class ResendSender(EmailSender):
    def __init__(self, api_key: str = "", from_addr: str = ""):
        self.api_key = api_key or settings.RESEND_API_KEY
        self.from_addr = from_addr or settings.EMAIL_FROM
        resend.api_key = self.api_key

    def send(self, to: str, subject: str, html: str) -> None:
        if not self.api_key:
            raise RuntimeError("Resend not configured - add your RESEND_API_KEY in Settings > Email.")
        resend.api_key = self.api_key
        resend.Emails.send({
            "from": self.from_addr,
            "to": [to],
            "subject": subject,
            "html": html,
        })
