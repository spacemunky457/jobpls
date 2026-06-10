import logging
import re
from services.email.base import EmailSender

log = logging.getLogger("jobpls.email")


class ConsoleSender(EmailSender):
    """Dev sender: logs the email (and any magic links) so you can test without Resend."""

    def send(self, to: str, subject: str, html: str) -> None:
        links = re.findall(r'href="([^"]+)"', html)
        log.info("=" * 70)
        log.info("EMAIL → %s", to)
        log.info("SUBJECT: %s", subject)
        for link in links:
            log.info("LINK: %s", link)
        log.info("=" * 70)
