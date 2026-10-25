from io import BytesIO

import numpy as np
from PIL import Image
from django.core.files.base import ContentFile

from .models import DetectedFace

try:
    import face_recognition
except ImportError:
    # Sans la librairie, l'upload reste possible mais aucun visage n'est detecte.
    face_recognition = None


# Deux visages dont la distance est inferieure a ce seuil sont considers
# comme la meme personne.
SEUIL_SUGGESTION = 0.6


def detect_and_encode(image_path):
    """Detecte les visages d'une image et renvoie leur position + encodage."""
    if face_recognition is None:
        return []

    image = face_recognition.load_image_file(image_path)
    locations = face_recognition.face_locations(image)
    encodings = face_recognition.face_encodings(image, locations)

    results = []
    for location, encoding in zip(locations, encodings):
        top, right, bottom, left = location
        results.append({
            'bounding_box': {
                'top': top,
                'right': right,
                'bottom': bottom,
                'left': left,
            },
            'encoding': encoding.tolist(),
        })
    return results


def crop_face(image_path, bounding_box):
    """Decoupe le visage dans l'image et renvoie le fichier image."""
    image = Image.open(image_path)
    left = bounding_box['left']
    top = bounding_box['top']
    right = bounding_box['right']
    bottom = bounding_box['bottom']

    crop = image.crop((left, top, right, bottom))
    if crop.mode != 'RGB':
        crop = crop.convert('RGB')

    buffer = BytesIO()
    crop.save(buffer, format='JPEG')
    return ContentFile(buffer.getvalue())


def suggest_person(encoding, owner):
    """Compare un encodage aux visages connus de l'utilisateur."""
    if face_recognition is None:
        return None

    known_faces = DetectedFace.objects.filter(
        photo__owner=owner,
        person__owner=owner,
    ).select_related('person')

    best_person = None
    best_distance = None
    target_encoding = np.array(encoding)

    for known_face in known_faces:
        if not known_face.encoding:
            continue
        known_encoding = np.array(known_face.encoding)
        distance = face_recognition.face_distance([known_encoding], target_encoding)[0]
        distance = float(distance)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_person = known_face.person

    if best_person is not None and best_distance <= SEUIL_SUGGESTION:
        return best_person, best_distance
    return None


def process_photo(media_file):
    """Detecte les visages d'une photo et enregistre un DetectedFace par visage."""
    if face_recognition is None:
        return

    results = detect_and_encode(media_file.file.path)
    for index, result in enumerate(results, start=1):
        detected_face = DetectedFace.objects.create(
            photo=media_file,
            encoding=result['encoding'],
            bounding_box=result['bounding_box'],
        )

        suggestion = suggest_person(result['encoding'], media_file.owner)
        if suggestion is not None:
            detected_face.suggested_person = suggestion[0]
            detected_face.distance = suggestion[1]
            detected_face.save()

        crop = crop_face(media_file.file.path, result['bounding_box'])
        filename = 'face_%s_%s.jpg' % (media_file.pk, index)
        detected_face.face_crop.save(filename, crop)
