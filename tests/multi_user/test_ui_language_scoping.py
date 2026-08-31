"""M1 regression — interface_settings.py must resolve per-user, not at import."""

from __future__ import annotations

import json

from deeptutor.services.settings.interface_settings import (
    get_response_language,
    get_ui_language,
    get_ui_settings,
)


def test_get_ui_language_reads_per_user_interface_json(mu_isolated_root, as_user):
    # Admin's interface.json says English…
    admin_settings = mu_isolated_root / "data" / "user" / "settings" / "interface.json"
    admin_settings.parent.mkdir(parents=True, exist_ok=True)
    admin_settings.write_text(json.dumps({"theme": "light", "language": "en"}))

    # …while alice has chosen Chinese in her own scope.
    alice_settings = (
        mu_isolated_root / "data" / "users" / "u_alice" / "user" / "settings" / "interface.json"
    )
    alice_settings.parent.mkdir(parents=True, exist_ok=True)
    alice_settings.write_text(json.dumps({"theme": "dark", "language": "zh"}))

    with as_user("u_admin", role="admin"):
        assert get_ui_language() == "en"
        assert get_ui_settings()["theme"] == "light"

    with as_user("u_alice", role="user"):
        assert get_ui_language() == "zh"
        assert get_ui_settings()["theme"] == "dark"


def test_get_ui_language_defaults_when_no_file(mu_isolated_root, as_user):
    with as_user("u_alice", role="user"):
        # Bob has nothing on disk yet — falls back to the default "en".
        assert get_ui_language() == "en"


def test_response_language_is_scoped_independently_per_user(mu_isolated_root, as_user):
    admin_settings = mu_isolated_root / "data" / "user" / "settings" / "interface.json"
    admin_settings.parent.mkdir(parents=True, exist_ok=True)
    admin_settings.write_text(json.dumps({"language": "en", "response_language": "zh"}))

    alice_settings = (
        mu_isolated_root / "data" / "users" / "u_alice" / "user" / "settings" / "interface.json"
    )
    alice_settings.parent.mkdir(parents=True, exist_ok=True)
    alice_settings.write_text(json.dumps({"language": "zh", "response_language": "en"}))

    with as_user("u_admin", role="admin"):
        assert get_ui_language() == "en"
        assert get_response_language() == "zh"

    with as_user("u_alice", role="user"):
        assert get_ui_language() == "zh"
        assert get_response_language() == "en"


def test_response_language_does_not_inherit_admin_file_without_a_caller(
    mu_isolated_root, monkeypatch
):
    """A turn with no user context must not pick up the admin's reply language.

    ``get_path_service()`` falls back to the admin-scope file when the
    ContextVar is unset. That file is where an admin's ``response_language:
    fr`` once lived, and every unscoped ``get_response_language()`` call
    then injected French into the prompt. Default to English instead.
    """
    from deeptutor.services import auth as auth_service

    monkeypatch.setattr(auth_service, "AUTH_ENABLED", True)
    admin_settings = mu_isolated_root / "data" / "user" / "settings" / "interface.json"
    admin_settings.parent.mkdir(parents=True, exist_ok=True)
    admin_settings.write_text(json.dumps({"language": "en", "response_language": "fr"}))

    assert get_response_language() == "en"
