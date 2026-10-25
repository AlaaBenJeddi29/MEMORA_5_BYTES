"""Link summaries to Module 1's real journal entries.

The old ``journal_entry_id`` column held mock fixture IDs (900001-900003) and
was never a real relation. Before adding the foreign key, every reference that
does not resolve to a journal entry owned by the summary's owner is cleared.
Summaries and all their user-authored content are preserved; only the
untrusted source link is removed.
"""

import django.db.models.deletion
from django.db import migrations, models


def clear_untrusted_references(apps, schema_editor):
    Summary = apps.get_model("summaries", "Summary")
    JournalEntry = apps.get_model("journal", "JournalEntry")

    for summary in Summary.objects.exclude(journal_entry=None).iterator():
        owned = JournalEntry.objects.filter(
            pk=summary.journal_entry_id,
            user_id=summary.owner_id,
        ).exists()
        if not owned:
            Summary.objects.filter(pk=summary.pk).update(journal_entry=None)


class Migration(migrations.Migration):

    dependencies = [
        ("journal", "0001_initial"),
        ("summaries", "0001_initial"),
    ]

    operations = [
        migrations.RenameField(
            model_name="summary",
            old_name="journal_entry_id",
            new_name="journal_entry",
        ),
        migrations.RunPython(
            clear_untrusted_references,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="summary",
            name="journal_entry",
            field=models.ForeignKey(
                blank=True,
                db_column="journal_entry_id",
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="summaries",
                to="journal.journalentry",
            ),
        ),
    ]
