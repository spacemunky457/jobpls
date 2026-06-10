"""SMTP email sender — lets the user send real emails to themselves with no domain
setup (e.g. Gmail: host smtp.gmail.com, port 587, an app password). Raises on
failure so the 'send test email' endpoint can report the exact problem."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from services.email.base import EmailSender

log = logging.getLogger("jobpls.email")


class SmtpSender(EmailSender):
    def __init__(self, host: str, port: int, user: str, password: str, from_addr: str = ""):
        self.host = host
        self.port = port
        self.user = user
        # Gmail app passwords are shown grouped with spaces ("abcd efgh ijkl mnop")
        # but must be sent without them — normalize so a pasted-with-spaces key works.
        self.password = (password or "").replace(" ", "")
        self.from_addr = from_addr or user

    def send(self, to: str, subject: str, html: str) -> None:
        if not (self.host and self.user and self.password):
            raise RuntimeError("SMTP not configured - set host, user and password in Settings > Email.")
        msg = EmailMessage()
        msg["From"] = self.from_addr
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content("This message is best viewed in an HTML-capable email client.")
        msg.add_alternative(html, subtype="html")

        context = ssl.create_default_context()
        if int(self.port) == 465:
            with smtplib.SMTP_SSL(self.host, self.port, timeout=20, context=context) as s:
                s.login(self.user, self.password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(self.host, self.port, timeout=20) as s:
                s.starttls(context=context)
                s.login(self.user, self.password)
                s.send_message(msg)
