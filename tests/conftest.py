import os
from pathlib import Path


def load_test_environment() -> None:
    """Load local test credentials without overriding existing variables."""

    env_file = Path(__file__).resolve().parent.parent / ".env.test"

    if not env_file.is_file():
        return

    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        # Remove optional matching quotes around a value.
        if (
            len(value) >= 2
            and value[0] in ("'", '"')
            and value[-1] == value[0]
        ):
            value = value[1:-1]

        # Do not override values supplied by the current environment.
        if key and key not in os.environ:
            os.environ[key] = value


load_test_environment()