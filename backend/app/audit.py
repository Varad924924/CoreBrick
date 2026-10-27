
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def record_audit_log(
    db: Session,
    actor: User,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    details: dict | None = None,
) -> None:
    """Add an audit record to the current database transaction."""
    db.add(
        AuditLog(
            actor_user_id=actor.id,
            actor_email=actor.email,
            actor_role=actor.role,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )
