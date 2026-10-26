from django.conf import settings
from django.db import models


class Person(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='people',
    )
    name = models.CharField(max_length=255)
    avatar = models.ImageField(upload_to='people/avatars/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = ('owner', 'name')

    def __str__(self):
        return self.name


class DetectedFace(models.Model):
    photo = models.ForeignKey(
        'media_library.MediaFile',
        on_delete=models.CASCADE,
        related_name='faces',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='faces',
    )
    encoding = models.JSONField()
    bounding_box = models.JSONField()
    face_crop = models.ImageField(upload_to='people/faces/', null=True, blank=True)
    distance = models.FloatField(null=True, blank=True)
    suggested_person = models.ForeignKey(
        Person,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return 'Visage %s (photo %s)' % (self.pk, self.photo_id)
