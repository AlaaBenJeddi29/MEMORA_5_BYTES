from django.conf import settings
from django.db import models


class Photo(models.Model):
    """A photo uploaded by a user."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='photos',
    )
    image = models.FileField(
        upload_to='photos/%Y/%m/%d/',
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Photo by {self.user} ({self.created_at})'
