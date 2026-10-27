"""Add per-image Company review state and feedback.

Revision ID: 7c2b1d6e8f40
Revises: 5dfdfa7922e7
Create Date: 2026-10-26
"""
from alembic import op
import sqlalchemy as sa

revision = "7c2b1d6e8f40"
down_revision = "5dfdfa7922e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_images",
        sa.Column(
            "review_status",
            sa.String(length=30),
            server_default="pending_review",
            nullable=False,
        ),
    )
    op.add_column(
        "project_images",
        sa.Column("review_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "project_images",
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Preserve historical visibility: images belonging to projects already
    # approved before this feature are treated as approved during migration.
    op.execute(
        """
        UPDATE project_images AS pi
        SET review_status = CASE
            WHEN p.status = 'approved' THEN 'approved'
            ELSE 'pending_review'
        END,
        reviewed_at = CASE
            WHEN p.status = 'approved' THEN p.reviewed_at
            ELSE NULL
        END
        FROM projects AS p
        WHERE p.id = pi.project_id
        """
    )


def downgrade() -> None:
    op.drop_column("project_images", "reviewed_at")
    op.drop_column("project_images", "review_notes")
    op.drop_column("project_images", "review_status")
