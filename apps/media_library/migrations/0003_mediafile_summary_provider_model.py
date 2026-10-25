"""Replace the unverifiable journal integer with real provenance fields.

``JournalEntry.photos`` already owns the journal-to-media relation, so this
migration does not add a second one. ``summary`` records Module 3 provenance
and ``provider``/``model`` record how an AI image was produced.

The old ``journal_entry_id`` integer held IDs from the removed in-memory
fixture as well as unvalidated client input. Those values cannot be proven to
belong to the media owner's real journal entries, so they are intentionally
not backfilled into the many-to-many relation. Media rows and stored files are
preserved; only the untrusted association is dropped.
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("media_library", "0002_mediafile_status"),
        ("summaries", "0002_summary_journal_entry_fk"),
    ]

    operations = [
        migrations.AddField(
            model_name="mediafile",
            name="model",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="mediafile",
            name="provider",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="mediafile",
            name="summary",
            field=models.ForeignKey(
                blank=True,
                db_index=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="media_files",
                to="summaries.summary",
            ),
        ),
        migrations.RemoveField(
            model_name="mediafile",
            name="journal_entry_id",
        ),
    ]
