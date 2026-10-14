"""Paths, model settings and run limits for the agent team.

Limits can be overridden with environment variables (e.g. TEAM_MAX_MODEL_REQUESTS=20).
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
HW_DIR = BACKEND_DIR.parent
PROMPTS_DIR = BACKEND_DIR / "prompts"
OUTPUT_DIR = HW_DIR / "output"
# CAMPUS_CUSTOMS_AUDIT / CAMPUS_CUSTOMS_DB are optional overrides for isolated tests.
AUDIT_PATH = Path(os.getenv("CAMPUS_CUSTOMS_AUDIT") or OUTPUT_DIR / "audit_trail.json")

DATA_DIR = HW_DIR / "data"
ORIGINAL_DB = DATA_DIR / "campus_customs.db"
WORKING_DB = Path(os.getenv("CAMPUS_CUSTOMS_DB") or DATA_DIR / "campus_customs_new.db")

# The MCP server is the only path to the database. The team launches it over stdio.
MCP_SERVER = HW_DIR / "mcp_server" / "server.py"


def _mcp_python() -> Path:
    """Python used to launch the MCP server: an explicit override, else the first venv found
    (mcp_server/.venv, then the single hw5/.venv from the README), else this interpreter."""
    if override := os.getenv("CAMPUS_CUSTOMS_MCP_PYTHON"):
        return Path(override)
    for venv in (HW_DIR / "mcp_server" / ".venv", HW_DIR / ".venv"):
        for exe in ("Scripts/python.exe", "bin/python"):
            if (venv / exe).exists():
                return venv / exe
    return Path(sys.executable)


MCP_PYTHON = _mcp_python()

load_dotenv(HW_DIR / ".env")  # hw5/.env if present
load_dotenv(HW_DIR.parent / ".env")  # otherwise the course root .env

# Every agent uses exactly this model through Portkey. No alternatives or fallbacks.
MODEL_NAME = "gpt-6-luna"
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"


def _int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value and value.strip().isdigit() else default


# Limits for one ticket run (Boss plus every agent it delegates to, combined).
MAX_MODEL_REQUESTS = _int_env("TEAM_MAX_MODEL_REQUESTS", 40)  # model calls across all agents
MAX_TOTAL_TOKENS = _int_env("TEAM_MAX_TOTAL_TOKENS", 250_000)  # input + output tokens across all agents
MAX_TOOL_CALLS = _int_env("TEAM_MAX_TOOL_CALLS", 60)  # MCP + delegate calls across all agents
MAX_DELEGATIONS = _int_env("TEAM_MAX_DELEGATIONS", 8)  # delegate() calls across the whole run
MAX_DELEGATION_DEPTH = _int_env("TEAM_MAX_DELEGATION_DEPTH", 3)  # Boss=0 -> A=1 -> B=2 -> C=3
MAX_AGENT_STEPS = _int_env("TEAM_MAX_AGENT_STEPS", 24)  # loop nodes in any single agent's run
