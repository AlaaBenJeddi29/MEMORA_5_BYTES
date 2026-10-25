from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.media_library.models import MediaFile

from .models import DetectedFace, Person
from .serializers import (
    DetectedFaceSerializer,
    PersonSerializer,
    PhotoDetailSerializer,
    PhotoSerializer,
)


def _context(request):
    return {'request': request}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def person_list(request):
    if request.method == 'GET':
        people = Person.objects.filter(owner=request.user).order_by('name')
        return Response(PersonSerializer(people, many=True, context=_context(request)).data)

    serializer = PersonSerializer(data=request.data, context=_context(request))
    serializer.is_valid(raise_exception=True)
    serializer.save(owner=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def person_detail(request, pk):
    person = get_object_or_404(Person, pk=pk, owner=request.user)

    if request.method == 'GET':
        return Response(PersonSerializer(person, context=_context(request)).data)

    if request.method == 'PATCH':
        serializer = PersonSerializer(
            person,
            data=request.data,
            partial=True,
            context=_context(request),
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    person.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def person_photos(request, pk):
    person = get_object_or_404(Person, pk=pk, owner=request.user)
    faces = DetectedFace.objects.filter(
        person=person,
        photo__owner=request.user,
    ).select_related('photo').order_by('-photo__created_at', 'created_at')

    photos = []
    photos_by_id = {}
    for face in faces:
        entry = photos_by_id.get(face.photo_id)
        if entry is None:
            entry = {
                'id': face.photo_id,
                'photo': request.build_absolute_uri(face.photo.file.url),
                'uploaded_at': face.photo.created_at,
                'crops': [],
            }
            photos_by_id[face.photo_id] = entry
            photos.append(entry)
        if face.face_crop:
            entry['crops'].append(request.build_absolute_uri(face.face_crop.url))

    return Response(photos)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def photo_list(request):
    photos = MediaFile.objects.filter(
        owner=request.user,
    ).prefetch_related('faces').order_by('-created_at')
    return Response(PhotoSerializer(photos, many=True, context=_context(request)).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def photo_detail(request, pk):
    photo = get_object_or_404(MediaFile, pk=pk, owner=request.user)
    return Response(PhotoDetailSerializer(photo, context=_context(request)).data)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def face_detail(request, pk):
    face = get_object_or_404(DetectedFace, pk=pk, photo__owner=request.user)

    if request.method == 'DELETE':
        face.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if 'person' not in request.data:
        return Response(
            {'person': ['Ce champ est obligatoire.']},
            status=status.HTTP_400_BAD_REQUEST,
        )

    person_id = request.data.get('person')
    if person_id is None:
        face.person = None
    else:
        try:
            person_pk = int(person_id)
        except (TypeError, ValueError):
            return Response(
                {'person': ['Identifiant de personne invalide.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        face.person = get_object_or_404(Person, pk=person_pk, owner=request.user)

    face.save(update_fields=['person'])
    return Response(DetectedFaceSerializer(face, context=_context(request)).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def face_confirm(request, pk):
    face = get_object_or_404(DetectedFace, pk=pk, photo__owner=request.user)

    if face.suggested_person_id is not None:
        face.person = face.suggested_person
        face.save(update_fields=['person'])

    return Response(DetectedFaceSerializer(face, context=_context(request)).data)
