import asyncio
import hashlib
import hmac
import json
import logging
import re
import secrets
import urllib.error
import urllib.request
from collections import deque

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from app.database import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks/whatsapp", tags=["WhatsApp"])

# Lightweight duplicate protection for Meta webhook retries; resets on restart.
_processed_ids: set[str] = set()
_processed_order: deque[str] = deque()
_MAX_REMEMBERED_IDS = 5000

FAQ = {
    "welcome": (
        "Welcome to MHD! I can help you with home designs, project information, "
        "architects, AI home design, and construction enquiries.\n\n"
        "What would you like to know?"
    ),
    "projects": (
        "You can explore approved home design projects on the MHD website. "
        "Project details and available images are shown on each project page.\n\n"
        "If you have a particular style or project in mind, tell me a little about it."
    ),
    "architect": (
        "MHD helps customers discover architects and their design work. "
        "Tell us your city and the type of home you want to build, and the MHD team "
        "can help you with the next step."
    ),
    "ai_design": (
        "MHD is working toward an AI Home Design Assistant to help customers explore "
        "home design possibilities. Please share your plot dimensions, facing, and "
        "city so the team can understand your requirement."
    ),
    "budget": (
        "Construction cost depends on plot size, built-up area, location, design, "
        "materials, and finish level. MHD does not provide a reliable estimate from "
        "plot size alone.\n\n"
        "Please share your plot dimensions, city, and approximate built-up area "
        "if known. The team can review your requirement."
    ),
    "enquiry": (
        "Sure, I can help you start an enquiry.\n\n"
        "Please send your city, plot dimensions, and what you need help with "
        "(home design, architect, or construction). The MHD team can follow up."
    ),
    "help": (
        "I can help with:\n"
        "• Home design projects\n"
        "• Finding an architect\n"
        "• AI home design information\n"
        "• Construction budget enquiries\n"
        "• Contacting the MHD team\n\n"
        "Send a short message about what you need."
    ),
    "fallback": (
        "Thanks for contacting MHD. I couldn't confidently identify your question.\n\n"
        "Please send 'help' to see what I can assist with, or share your city, "
        "plot dimensions, and requirement so the MHD team can guide you."
    ),
}

# Match specific terms before broad words such as "design".
INTENT_PATTERNS = [
    ("help", [r"\bhelp\b", r"\bmenu\b", r"\bwhat can you do\b", r"\boptions\b"]),
    ("architect", [r"\barchitect(s)?\b", r"\barchitecture\b", r"\bfind.*architect\b"]),
    ("ai_design", [
        r"\bai\b", r"\bartificial intelligence\b", r"\bdesign assistant\b",
        r"\bfloor plan\b", r"\bfloorplan\b", r"\bplan my house\b",
    ]),
    ("budget", [
        r"\bbudget\b", r"\bcost\b", r"\brate\b", r"\bprice\b",
        r"\bconstruction.*(cost|rate|price)\b",
    ]),
    ("projects", [
        r"\bproject(s)?\b", r"\bgallery\b", r"\bdesigns?\b",
        r"\bphotos?\b", r"\bimages?\b", r"\bshow.*(home|house)\b",
    ]),
    ("enquiry", [
        r"\benquiry\b", r"\binquiry\b", r"\bcontact\b", r"\bcall me\b",
        r"\binterested\b", r"\bneed.*(help|build|house|home)\b",
    ]),
]



# Lightweight per-sender enquiry context. This is in-memory and resets when
# the FastAPI process restarts; it is not a durable CRM/database record.
_enquiry_sessions: dict[str, dict[str, str]] = {}
_MAX_ENQUIRY_SESSIONS = 1000


def _extract_plot_area(text: str) -> str | None:
    normalized = text.lower().replace(",", " ")
    match = re.search(
        r"\b(\d{2,6}(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft|square\s*feet|square\s*foot)\b",
        normalized,
    )
    if match:
        return f"{match.group(1)} sq ft"
    # In comma-separated details like "Pune, 2000, home designs",
    # accept a standalone 3-6 digit number as plot area.
    if "," in text:
        match = re.search(r"(?:^|,)\s*(\d{3,6})(?:\s*,|$)", text)
        if match:
            return f"{match.group(1)} sq ft"
    return None


def _extract_city(text: str) -> str | None:
    # Support simple customer replies such as "Pune, 2000, home designs".
    first_part = text.split(",", 1)[0].strip()
    if (
        "," in text
        and first_part
        and not re.search(r"\d", first_part)
        and len(first_part) <= 60
        and first_part.lower() not in {"home design", "home designs", "architect", "construction"}
    ):
        return first_part.title()
    city_match = re.search(r"\b(?:in|at|city\s*[:\-])\s*([A-Za-z][A-Za-z .'-]{1,40})", text, re.I)
    if city_match:
        return city_match.group(1).strip(" .,-").title()

    # During an active enquiry, accept a city sent as a single reply (e.g. "Pune").
    # Avoid interpreting greetings, FAQ keywords, or requirement labels as cities.
    candidate = text.strip(" .,-")
    blocked = {
        "hi", "hello", "hey", "hii", "hiii", "namaste",
        "home", "house", "design", "designs", "home design", "home designs",
        "architect", "architecture", "construction", "build", "budget", "cost",
        "help", "projects", "gallery", "ai", "floor plan", "floorplan",
        "yes", "no", "ok", "okay", "thanks", "thank you",
    }
    if (
        candidate
        and len(candidate) <= 50
        and not re.search(r"\d", candidate)
        and candidate.lower() not in blocked
        and _extract_requirement(candidate) is None
        and not re.search(r"\b(want|need|please|looking|design|build|make|plan)\b", candidate, re.I)
        and re.fullmatch(r"[A-Za-z][A-Za-z .'-]*", candidate)
    ):
        return candidate.title()
    return None


def _extract_requirement(text: str) -> str | None:
    normalized = text.lower()
    if re.search(
        r"\b(home|house)\s*design(s)?\b|\bdesign(s)?\s*(for|of)\s*(my\s*)?(home|house)\b|\b(want|need|like)\s+to\s+design\s+(my\s+)?(home|house)\b|\bdesign\s+(my|our)\s+(home|house)\b",
        normalized,
    ):
        return "Home design"
    if re.search(r"\barchitect(s)?\b|\barchitecture\b", normalized):
        return "Architect"
    if re.search(r"\bconstruction\b|\bbuild(ing)?\s*(a|my|our)?\s*(house|home)\b", normalized):
        return "Construction"
    if re.search(r"\b(ai|floor\s*plan|floorplan)\b", normalized):
        return "AI home design / floor plan"
    return None


def _is_enquiry_start(text: str) -> bool:
    normalized = text.lower()
    return bool(
        re.search(
            r"\b(plot|sq\.?\s*ft|sqft|square feet|facing|enquiry|inquiry|need.*(home|house|design|build)|want\s+to\s+design\s+(my\s+)?(home|house)|design\s+(my|our)\s+(home|house))\b",
            normalized,
        )
    )


def _handle_enquiry_message(sender: str, text: str) -> str | None:
    """Return a contextual enquiry response, or None when this isn't an enquiry."""
    normalized = text.lower().strip()
    if normalized in {"cancel enquiry", "cancel", "stop enquiry"}:
        _enquiry_sessions.pop(sender, None)
        return "Your current enquiry chat has been cancelled. Send 'help' whenever you'd like to start again."

    session = _enquiry_sessions.get(sender)
    if session is None and not _is_enquiry_start(text):
        return None

    greetings = {"hi", "hello", "hey", "hii", "hiii", "good morning", "good afternoon", "good evening", "namaste"}
    if session is not None and normalized in greetings:
        known = []
        if session.get("city"):
            known.append(f"City: {session['city']}")
        if session.get("plot_area"):
            known.append(f"Plot area: {session['plot_area']}")
        if session.get("dimensions"):
            known.append(f"Dimensions: {session['dimensions']}")
        if session.get("requirement"):
            known.append(f"Requirement: {session['requirement']}")
        if session.get("floors"):
            known.append(f"Floors: {session['floors']}")
        missing = []
        if not session.get("city"):
            missing.append("city")
        if not session.get("plot_area") and not session.get("dimensions"):
            missing.append("plot area or dimensions")
        if not session.get("requirement"):
            missing.append("requirement")
        if not session.get("dimensions"):
            missing.append("exact plot dimensions")
        if not session.get("floors"):
            missing.append("number of floors")
        intro = "Hi! We’re continuing your MHD enquiry."
        if known:
            intro += " I have: " + "; ".join(known) + "."
        if missing:
            intro += " Still needed: " + ", ".join(missing) + ". Please send the missing details together if possible (for example: Pune, 40 x 50 ft, 2 floors)."
        else:
            intro += " I have the details needed to continue. The MHD team can review your enquiry."
        return intro

    if session is None:
        if len(_enquiry_sessions) >= _MAX_ENQUIRY_SESSIONS:
            # Remove the oldest inserted session to keep this small in-memory map bounded.
            _enquiry_sessions.pop(next(iter(_enquiry_sessions)))
        session = {"city": "", "plot_area": "", "dimensions": "", "requirement": "", "floors": ""}
        _enquiry_sessions[sender] = session

    city = _extract_city(text)
    area = _extract_plot_area(text)
    requirement = _extract_requirement(text)
    dimensions_match = re.search(r"\b(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet|')?\s*[x×]\s*(\d{1,3}(?:\.\d+)?)\s*(?:ft|feet|')?\b", text, re.I)
    floors_match = re.search(r"\b(\d+)\s*(?:floor|floors|storey|storeys|story|stories)\b", text, re.I)

    if city:
        session["city"] = city
    if area:
        session["plot_area"] = area
    if requirement:
        session["requirement"] = requirement
    if dimensions_match:
        session["dimensions"] = f"{dimensions_match.group(1)} x {dimensions_match.group(2)} ft"
    if floors_match:
        session["floors"] = floors_match.group(1)

    missing = []
    if not session["city"]:
        missing.append("your city")
    if not session["plot_area"] and not session["dimensions"]:
        missing.append("plot area or dimensions (for example, 2000 sq ft or 20 x 100 ft)")
    if not session["requirement"]:
        missing.append("what you need (home design, architect, or construction)")
    if not session["dimensions"]:
        missing.append("exact plot dimensions, if available")
    if not session["floors"]:
        missing.append("number of floors you plan")

    if not session["city"] or (not session["plot_area"] and not session["dimensions"]) or not session["requirement"]:
        collected = []
        if session["city"]:
            collected.append(f"City: {session['city']}")
        if session["plot_area"]:
            collected.append(f"Plot area: {session['plot_area']}")
        if session["dimensions"]:
            collected.append(f"Dimensions: {session['dimensions']}")
        if session["requirement"]:
            collected.append(f"Requirement: {session['requirement']}")
        summary = ("I have noted: " + "; ".join(collected) + ".\n\n") if collected else ""
        return summary + "To continue your MHD enquiry, please share " + " and ".join(missing[:3]) + "."

    summary = (
        f"Thanks! I have these details for your MHD enquiry:\n"
        f"City: {session['city']}\n"
        f"Plot: {session['plot_area'] or session['dimensions']}\n"
        f"Requirement: {session['requirement']}"
    )
    if session["dimensions"]:
        summary += f"\nDimensions: {session['dimensions']}"
    if session["floors"]:
        summary += f"\nFloors: {session['floors']}"
    if not session["dimensions"] or not session["floors"]:
        ask = []
        if not session["dimensions"]:
            ask.append("exact plot dimensions (for example, 20 x 100 ft)")
        if not session["floors"]:
            ask.append("number of floors")
        return summary + "\n\nPlease also share " + " and ".join(ask) + " if known."
    return summary + "\n\nYour details are collected in this chat. The MHD team can review them once the enquiry submission is connected."


def _classify_message(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.lower()).strip()

    greetings = {
        "hi", "hello", "hey", "hii", "hiii", "good morning",
        "good afternoon", "good evening", "namaste",
    }
    if normalized in greetings or normalized.startswith(("hi ", "hello ", "hey ")):
        return "welcome"

    # Plot-size/location messages are enquiry details, not project-gallery searches.
    if re.search(r"\b(plot|sq\.?\s*ft|sqft|square feet|ft\s*x\s*ft|facing)\b", normalized):
        return "enquiry"

    for intent, patterns in INTENT_PATTERNS:
        if any(re.search(pattern, normalized) for pattern in patterns):
            return intent

    return "fallback"


def _reply_for_message(text: str, sender: str | None = None) -> str:
    if sender:
        contextual_reply = _handle_enquiry_message(sender, text)
        if contextual_reply is not None:
            return contextual_reply
    intent = _classify_message(text)
    return FAQ.get(intent, FAQ["fallback"])


def _send_whatsapp_text(to: str, body: str) -> dict:
    access_token = settings.whatsapp_access_token
    phone_number_id = settings.whatsapp_phone_number_id
    api_version = settings.whatsapp_api_version.strip()

    if not access_token or not phone_number_id:
        raise RuntimeError("WhatsApp access token or phone number ID is not configured.")

    url = f"https://graph.facebook.com/{api_version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response_text = response.read().decode("utf-8")
            return json.loads(response_text) if response_text else {}
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        logger.error(
            "WhatsApp send failed: HTTP %s; response=%s",
            exc.code,
            error_body[:1500],
        )
        raise RuntimeError(f"WhatsApp Cloud API returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("WhatsApp Cloud API network error: %s", exc.reason)
        raise RuntimeError("Could not reach WhatsApp Cloud API.") from exc


def _remember_message_id(message_id: str) -> bool:
    if message_id in _processed_ids:
        return False

    _processed_ids.add(message_id)
    _processed_order.append(message_id)

    while len(_processed_order) > _MAX_REMEMBERED_IDS:
        _processed_ids.discard(_processed_order.popleft())

    return True


@router.get("")
async def verify_whatsapp_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
):
    configured_token = settings.whatsapp_verify_token

    if not configured_token:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp webhook verify token is not configured.",
        )

    if (
        hub_mode != "subscribe"
        or not hub_verify_token
        or not secrets.compare_digest(hub_verify_token, configured_token)
        or hub_challenge is None
    ):
        raise HTTPException(status_code=403, detail="WhatsApp webhook verification failed.")

    return PlainTextResponse(content=hub_challenge, status_code=200)


@router.post("")
async def receive_whatsapp_webhook(request: Request):
    app_secret = settings.whatsapp_app_secret

    if not app_secret:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp app secret is not configured.",
        )

    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256", "")
    expected_signature = "sha256=" + hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    if not signature or not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid WhatsApp webhook signature.")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON webhook payload.")

    if payload.get("object") != "whatsapp_business_account":
        raise HTTPException(status_code=400, detail="Unexpected webhook object.")

    message_count = 0
    status_count = 0
    replies_sent = 0
    configured_phone_number_id = settings.whatsapp_phone_number_id

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue

            value = change.get("value", {})
            messages = value.get("messages", [])
            message_count += len(messages)
            status_count += len(value.get("statuses", []))

            event_phone_number_id = value.get("metadata", {}).get("phone_number_id")
            if (
                configured_phone_number_id
                and event_phone_number_id
                and event_phone_number_id != configured_phone_number_id
            ):
                logger.warning("Ignoring WhatsApp event for unexpected phone number ID.")
                continue

            for message in messages:
                # This first FAQ version responds only to text messages.
                if message.get("type") != "text":
                    continue

                sender = message.get("from")
                message_id = message.get("id")
                text_body = message.get("text", {}).get("body", "").strip()

                if not sender or not message_id or not text_body:
                    continue

                if not _remember_message_id(message_id):
                    logger.info("Skipping duplicate WhatsApp message event.")
                    continue

                reply_text = _reply_for_message(text_body, sender)

                try:
                    await asyncio.to_thread(
                        _send_whatsapp_text,
                        sender,
                        reply_text,
                    )
                    replies_sent += 1
                    logged_intent = (
                        "enquiry" if sender in _enquiry_sessions else _classify_message(text_body)
                    )
                    logger.info(
                        "WhatsApp FAQ reply accepted by Meta: intent=%s",
                        logged_intent,
                    )
                except Exception:
                    # Allow a retry if sending failed. The webhook itself still returns
                    # 200 to avoid repeated Meta delivery while the outbound call failed.
                    _processed_ids.discard(message_id)
                    try:
                        _processed_order.remove(message_id)
                    except ValueError:
                        pass
                    logger.exception("Unable to send WhatsApp FAQ reply.")

    logger.info(
        "WhatsApp webhook received: messages=%s statuses=%s replies_sent=%s",
        message_count,
        status_count,
        replies_sent,
    )

    return {"status": "received", "replies_sent": replies_sent}



