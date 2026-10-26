from rest_framework import serializers

from apps.media_library.models import MediaFile

from .models import DetectedFace, Person


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ('id', 'name', 'avatar', 'created_at')
        read_only_fields = ('created_at',)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError('Le nom est obligatoire.')

        owner = self.context['request'].user
        existing = Person.objects.filter(owner=owner, name=name)
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('Une personne avec ce nom existe déjà.')

        return name


class PersonBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = ('id', 'name')


class DetectedFaceSerializer(serializers.ModelSerializer):
    person = PersonBriefSerializer(read_only=True)
    suggested_person = PersonBriefSerializer(read_only=True)

    class Meta:
        model = DetectedFace
        fields = (
            'id',
            'face_crop',
            'bounding_box',
            'person',
            'suggested_person',
            'distance',
        )


class PhotoSerializer(serializers.ModelSerializer):
    faces_count = serializers.IntegerField(source='faces.count', read_only=True)
    photo = serializers.ImageField(source='file', read_only=True)
    uploaded_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = MediaFile
        fields = ('id', 'photo', 'uploaded_at', 'faces_count')


class PhotoDetailSerializer(serializers.ModelSerializer):
    faces = DetectedFaceSerializer(many=True, read_only=True)
    photo = serializers.ImageField(source='file', read_only=True)
    uploaded_at = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = MediaFile
        fields = ('id', 'photo', 'uploaded_at', 'faces')
