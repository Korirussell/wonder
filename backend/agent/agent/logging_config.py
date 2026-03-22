"""
Centralized logging setup for the Wonder agent server.

Usage:
    from .logging_config import setup_logging, get_logger

    setup_logging()                      # call once at startup
    logger = get_logger("wonder.server") # per-module logger

Environment variables:
    LOG_LEVEL   — DEBUG | INFO | WARNING | ERROR  (default: INFO)
    LOG_FILE    — optional path to write logs to (in addition to console)
"""
from __future__ import annotations

import logging
import os
from typing import Any

_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    _configured = True

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handlers: list[logging.Handler] = []

    # Rich console handler — pretty colours, tracebacks, timestamps
    try:
        from rich.logging import RichHandler
        console = RichHandler(
            level=level,
            rich_tracebacks=True,
            tracebacks_show_locals=level == logging.DEBUG,
            markup=True,
            show_path=level == logging.DEBUG,
        )
        console.setFormatter(logging.Formatter("%(message)s", datefmt="[%X]"))
        handlers.append(console)
    except ImportError:
        console = logging.StreamHandler()
        console.setLevel(level)
        console.setFormatter(
            logging.Formatter("%(asctime)s [%(name)-20s] %(levelname)-8s %(message)s")
        )
        handlers.append(console)

    # Optional file handler
    log_file = os.getenv("LOG_FILE")
    if log_file:
        fh = logging.FileHandler(log_file)
        fh.setLevel(level)
        fh.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(name)-20s] %(levelname)-8s %(message)s"
            )
        )
        handlers.append(fh)

    logging.basicConfig(level=level, handlers=handlers, force=True)

    # Quiet noisy third-party loggers at WARNING unless we're in DEBUG
    _quiet = logging.DEBUG if level == logging.DEBUG else logging.WARNING
    for name in ("httpx", "httpcore", "uvicorn.access", "motor", "google", "grpc"):
        logging.getLogger(name).setLevel(_quiet)

    # Keep uvicorn.error visible for startup/shutdown messages
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_event(logger: logging.Logger, event: Any) -> None:
    """Log a single ADK event at DEBUG level with tool-call / text details."""
    if not logger.isEnabledFor(logging.DEBUG):
        return
    if not (hasattr(event, "content") and event.content):
        return
    for part in event.content.parts or []:
        if hasattr(part, "function_call") and part.function_call:
            fc = part.function_call
            args_preview = str(dict(fc.args or {}))[:120]
            logger.debug("  → tool_call  [bold cyan]%s[/] %s", fc.name, args_preview)
        elif hasattr(part, "function_response") and part.function_response:
            fr = part.function_response
            logger.debug("  ← tool_resp  [bold green]%s[/]", fr.name)
        elif hasattr(part, "text") and part.text:
            preview = part.text[:120].replace("\n", " ")
            logger.debug("  ✦ text  %s%s", preview, "…" if len(part.text) > 120 else "")
