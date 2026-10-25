import logging

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
    """Supprime le fichier image du disque avec la photo."""
    if instance.photo:
        instance.photo.delete(save=False)


@receiver(post_delete, sender=DetectedFace)
def delete_face_crop_file(sender, instance, **kwargs):
    """Supprime le crop du disque avec le visage."""
    if instance.face_crop:
        instance.face_crop.delete(save=False)
