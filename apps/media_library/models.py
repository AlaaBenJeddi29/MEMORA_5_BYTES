from django.conf import settings
from django.db import models


class MediaFile(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='media_files',
    )
    photo = models.ImageField(upload_to='photos/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
