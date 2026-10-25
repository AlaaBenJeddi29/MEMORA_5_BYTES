import logging

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.media_library.models import MediaFile

from .models import DetectedFace
from .services import process_photo

logger = logging.getLogger(__name__)


@receiver(post_save, sender=MediaFile)
def process_new_media_file(sender, instance, created, **kwargs):
    """Lance l'analyse seulement quand une nouvelle photo est ajoutee."""
    if not created:
        return

    try:
        process_photo(instance)
    except Exception:
        # Une erreur de detection ne doit jamais bloquer l'upload.
        logger.exception('Erreur pendant la detection des visages.')


@receiver(post_delete, sender=MediaFile)
def delete_media_file(sender, instance, **kwargs):
    """Supprime le fichier apres validation, s'il n'est plus reference."""
    field_file = instance.file
    if not field_file:
        return

    file_name = field_file.name
    storage = field_file.storage
    if not file_name:
        return

    media_id = instance.pk

    def cleanup():
        try:
            if MediaFile.objects.filter(file=file_name).exists():
                return
            storage.delete(file_name)
        except Exception:
            logger.warning(
                'Stored file cleanup failed for deleted media %s.',
                media_id,
            )

    transaction.on_commit(cleanup)


@receiver(post_delete, sender=DetectedFace)
def delete_face_crop_file(sender, instance, **kwargs):
    """Supprime le crop du disque avec le visage."""
    if instance.face_crop:
        instance.face_crop.delete(save=False)
