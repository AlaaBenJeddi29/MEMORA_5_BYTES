import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.test import APIClient, APITestCase

from apps.media_library.models import MediaFile
from apps.people import services

from .models import DetectedFace, Person
from .serializers import PersonSerializer
from .services import suggest_person

User = get_user_model()

BOUNDING_BOX = {'top': 0, 'right': 10, 'bottom': 10, 'left': 0}


def create_photo(owner, name='photo.png'):
    # On evite de lancer la detection pendant les tests.
    with patch('apps.people.signals.process_photo'):
        return MediaFile.objects.create(owner=owner, file='photos/' + name)


def image_upload(name='photo.png', size=(20, 20), mode='RGB'):
    buffer = BytesIO()
    Image.new(mode, size, (30, 120, 180)).save(buffer, format='PNG')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='image/png')


class SuggestionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.other_user = User.objects.create_user(username='bob', email='bob@example.com', password='secret')
        self.third_user = User.objects.create_user(username='charlie', email='charlie@example.com', password='secret')

        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.photo = create_photo(self.user)
        self.encoding = [0.01] * 128
        DetectedFace.objects.create(
            photo=self.photo,
            person=self.person,
            encoding=self.encoding,
            bounding_box=BOUNDING_BOX,
        )

        # La reconnaissance faciale est mockee : distances calculees localement
        # avec numpy, sans dlib ni modele pre-entraine.
        self._face_recognition_patch = patch.object(
            services,
            'face_recognition',
            MagicMock(),
        )
        self.face_recognition = self._face_recognition_patch.start()
        self.addCleanup(self._face_recognition_patch.stop)
        self.face_recognition.face_distance.side_effect = self._euclidean_distance

    @staticmethod
    def _euclidean_distance(known_encodings, target_encoding):
        return [
            float(np.linalg.norm(np.array(known) - np.array(target_encoding)))
            for known in known_encodings
        ]

    def test_suggest_person_finds_known_face(self):
        result = suggest_person(self.encoding, self.user)

        self.assertIsNotNone(result)
        person, distance = result
        self.assertEqual(person, self.person)
        self.assertLessEqual(distance, 0.6)

    def test_suggest_person_rejects_face_above_threshold(self):
        result = suggest_person([1.0] * 128, self.user)

        self.assertIsNone(result)

    def test_suggest_person_ignores_other_users_faces(self):
        other_person = Person.objects.create(owner=self.other_user, name='Bob')
        other_photo = create_photo(self.other_user, 'bob.png')
        DetectedFace.objects.create(
            photo=other_photo,
            person=other_person,
            encoding=self.encoding,
            bounding_box=BOUNDING_BOX,
        )

        result = suggest_person(self.encoding, self.user)

        self.assertIsNotNone(result)
        self.assertEqual(result[0], self.person)
        self.assertNotEqual(result[0], other_person)

    def test_suggest_person_returns_none_for_user_without_faces(self):
        result = suggest_person(self.encoding, self.third_user)

        self.assertIsNone(result)

    def test_suggest_person_accepts_a_distance_equal_to_the_threshold(self):
        self.face_recognition.face_distance.side_effect = lambda *_: [0.6]

        result = suggest_person(self.encoding, self.user)

        self.assertIsNotNone(result)
        self.assertEqual(result[0], self.person)
        self.assertEqual(result[1], 0.6)

    def test_suggest_person_rejects_a_distance_above_the_threshold(self):
        self.face_recognition.face_distance.side_effect = lambda *_: [0.61]

        self.assertIsNone(suggest_person(self.encoding, self.user))

    def test_suggest_person_skips_faces_without_an_encoding(self):
        DetectedFace.objects.create(
            photo=self.photo,
            person=self.person,
            encoding=[],
            bounding_box=BOUNDING_BOX,
        )

        result = suggest_person(self.encoding, self.user)

        self.assertIsNotNone(result)
        self.assertEqual(self.face_recognition.face_distance.call_count, 1)

    def test_suggest_person_keeps_the_closest_candidate(self):
        closer_person = Person.objects.create(owner=self.user, name='Alicia')
        DetectedFace.objects.create(
            photo=self.photo,
            person=closer_person,
            encoding=[0.02] * 128,
            bounding_box=BOUNDING_BOX,
        )

        result = suggest_person([0.02] * 128, self.user)

        self.assertEqual(result[0], closer_person)

    def test_suggest_person_ignores_a_farther_candidate(self):
        farther_person = Person.objects.create(owner=self.user, name='Carol')
        DetectedFace.objects.create(
            photo=self.photo,
            person=farther_person,
            encoding=[0.5] * 128,
            bounding_box=BOUNDING_BOX,
        )

        result = suggest_person(self.encoding, self.user)

        self.assertEqual(result[0], self.person)

    def test_suggest_person_returns_none_without_the_face_recognition_library(self):
        with patch.object(services, 'face_recognition', None):
            self.assertIsNone(suggest_person(self.encoding, self.user))


class PersonSerializerValidationTests(SimpleTestCase):
    def test_blank_name_is_rejected_by_the_validator(self):
        with self.assertRaises(DRFValidationError):
            PersonSerializer().validate_name('   ')


class FaceDetectionServiceTests(SimpleTestCase):
    def test_detect_and_encode_returns_empty_without_the_library(self):
        with patch.object(services, 'face_recognition', None):
            self.assertEqual(services.detect_and_encode('ignored.png'), [])

    def test_detect_and_encode_maps_locations_and_encodings(self):
        encoding = np.array([0.1] * 128)
        fake_face_recognition = MagicMock()
        fake_face_recognition.load_image_file.return_value = 'loaded-image'
        fake_face_recognition.face_locations.return_value = [(1, 11, 21, 2)]
        fake_face_recognition.face_encodings.return_value = [encoding]

        with patch.object(
            services,
            'face_recognition',
            fake_face_recognition,
        ):
            results = services.detect_and_encode('photo.png')

        fake_face_recognition.load_image_file.assert_called_once_with('photo.png')
        fake_face_recognition.face_locations.assert_called_once_with('loaded-image')
        fake_face_recognition.face_encodings.assert_called_once_with(
            'loaded-image',
            [(1, 11, 21, 2)],
        )
        self.assertEqual(
            results,
            [
                {
                    'bounding_box': {
                        'top': 1,
                        'right': 11,
                        'bottom': 21,
                        'left': 2,
                    },
                    'encoding': encoding.tolist(),
                }
            ],
        )

    def test_detect_and_encode_returns_empty_when_no_face_is_found(self):
        fake_face_recognition = MagicMock()
        fake_face_recognition.face_locations.return_value = []
        fake_face_recognition.face_encodings.return_value = []

        with patch.object(
            services,
            'face_recognition',
            fake_face_recognition,
        ):
            self.assertEqual(services.detect_and_encode('photo.png'), [])

    def test_crop_face_returns_a_jpeg_of_the_requested_region(self):
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / 'source.png'
            Image.new('RGB', (20, 20), (255, 0, 0)).save(source_path)

            crop = services.crop_face(
                str(source_path),
                {'top': 3, 'right': 13, 'bottom': 13, 'left': 2},
            )

        image = Image.open(BytesIO(crop.read()))
        self.assertEqual(image.format, 'JPEG')
        self.assertEqual(image.size, (11, 10))

    def test_crop_face_converts_alpha_images_to_rgb(self):
        with tempfile.TemporaryDirectory() as directory:
            source_path = Path(directory) / 'source.png'
            Image.new('RGBA', (20, 20), (255, 0, 0, 128)).save(source_path)

            crop = services.crop_face(
                str(source_path),
                {'top': 0, 'right': 10, 'bottom': 10, 'left': 0},
            )

        image = Image.open(BytesIO(crop.read()))
        self.assertEqual(image.mode, 'RGB')


class ProcessPhotoTests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_root_override = override_settings(
            MEDIA_ROOT=self.media_directory.name,
        )
        self.media_root_override.enable()
        self.addCleanup(self.media_root_override.disable)

        self.user = User.objects.create_user(username='alice', password='secret')
        with patch('apps.people.signals.process_photo'):
            self.photo = MediaFile.objects.create(
                owner=self.user,
                file=image_upload(),
            )
        self.bounding_box = {'top': 1, 'right': 11, 'bottom': 21, 'left': 2}

    def test_process_photo_is_a_noop_without_the_library(self):
        with patch.object(services, 'face_recognition', None):
            services.process_photo(self.photo)

        self.assertEqual(DetectedFace.objects.count(), 0)

    def test_process_photo_creates_faces_with_suggestion_and_crop(self):
        person = Person.objects.create(owner=self.user, name='Alice')
        detected = [
            {'bounding_box': self.bounding_box, 'encoding': [0.1] * 128},
        ]

        with patch.object(
            services,
            'detect_and_encode',
            return_value=detected,
        ) as detect, patch.object(
            services,
            'suggest_person',
            return_value=(person, 0.25),
        ) as suggest, patch.object(
            services,
            'crop_face',
            return_value=ContentFile(b'jpeg-bytes'),
        ) as crop:
            services.process_photo(self.photo)

        detect.assert_called_once_with(self.photo.file.path)
        suggest.assert_called_once_with([0.1] * 128, self.user)
        crop.assert_called_once_with(self.photo.file.path, self.bounding_box)

        face = DetectedFace.objects.get()
        self.assertEqual(face.photo, self.photo)
        self.assertEqual(face.encoding, [0.1] * 128)
        self.assertEqual(face.bounding_box, self.bounding_box)
        self.assertEqual(face.suggested_person, person)
        self.assertEqual(face.distance, 0.25)
        self.assertEqual(
            face.face_crop.name,
            'people/faces/face_%s_1.jpg' % self.photo.pk,
        )
        self.assertTrue(face.face_crop.storage.exists(face.face_crop.name))

    def test_process_photo_numbers_crops_and_handles_no_suggestion(self):
        detected = [
            {'bounding_box': self.bounding_box, 'encoding': [0.1] * 128},
            {'bounding_box': self.bounding_box, 'encoding': [0.2] * 128},
        ]

        with patch.object(
            services,
            'detect_and_encode',
            return_value=detected,
        ), patch.object(
            services,
            'suggest_person',
            return_value=None,
        ), patch.object(
            services,
            'crop_face',
            side_effect=[
                ContentFile(b'first-crop'),
                ContentFile(b'second-crop'),
            ],
        ):
            services.process_photo(self.photo)

        faces = DetectedFace.objects.order_by('pk')
        self.assertEqual(faces.count(), 2)
        self.assertEqual(
            [face.face_crop.name for face in faces],
            [
                'people/faces/face_%s_1.jpg' % self.photo.pk,
                'people/faces/face_%s_2.jpg' % self.photo.pk,
            ],
        )
        self.assertEqual([face.suggested_person for face in faces], [None, None])
        self.assertEqual([face.distance for face in faces], [None, None])

    def test_process_photo_creates_nothing_without_detections(self):
        with patch.object(services, 'detect_and_encode', return_value=[]):
            services.process_photo(self.photo)

        self.assertEqual(DetectedFace.objects.count(), 0)


class SignalTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')

    def test_process_photo_runs_when_media_is_created(self):
        with patch('apps.people.signals.process_photo') as process:
            MediaFile.objects.create(owner=self.user, file='photos/new.png')

        process.assert_called_once()

    def test_process_photo_does_not_run_when_media_is_updated(self):
        with patch('apps.people.signals.process_photo'):
            photo = MediaFile.objects.create(owner=self.user, file='photos/old.png')

        with patch('apps.people.signals.process_photo') as process:
            photo.save()

        process.assert_not_called()


class PeopleIsolationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.other_user = User.objects.create_user(username='bob', email='bob@example.com', password='secret')

        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.other_person = Person.objects.create(owner=self.other_user, name='Bob')

        self.photo = create_photo(self.user, 'alice.png')
        self.other_photo = create_photo(self.other_user, 'bob.png')

        self.face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )
        self.other_face = DetectedFace.objects.create(
            photo=self.other_photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.face.suggested_person = self.person
        self.face.distance = 0.2
        self.face.save()

        self.client.force_login(self.user)

    def test_person_list_only_shows_own_people(self):
        response = self.client.get(reverse('people:person_list'))

        self.assertContains(response, 'Alice')
        self.assertNotContains(response, 'Bob')

    def test_photo_list_only_shows_own_photos(self):
        response = self.client.get(reverse('people:photo_list'))

        self.assertEqual(list(response.context['photos']), [self.photo])

    def test_person_detail_shows_own_person(self):
        response = self.client.get(
            reverse('people:person_detail', args=[self.person.pk])
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Alice')

    def test_person_detail_hides_other_users_person(self):
        response = self.client.get(
            reverse('people:person_detail', args=[self.other_person.pk])
        )

        self.assertEqual(response.status_code, 404)

    def test_photo_detail_shows_own_photo_and_suggestion(self):
        response = self.client.get(
            reverse('people:photo_detail', args=[self.photo.pk])
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Suggestion : Alice')

    def test_photo_detail_hides_other_users_photo(self):
        response = self.client.get(
            reverse('people:photo_detail', args=[self.other_photo.pk])
        )

        self.assertEqual(response.status_code, 404)

    def test_person_edit_updates_name(self):
        response = self.client.post(
            reverse('people:person_edit', args=[self.person.pk]),
            {'name': 'Alicia'},
        )

        self.assertRedirects(
            response,
            reverse('people:person_detail', args=[self.person.pk]),
        )
        self.person.refresh_from_db()
        self.assertEqual(self.person.name, 'Alicia')

    def test_person_edit_rejects_duplicate_name(self):
        Person.objects.create(owner=self.user, name='Alicia')

        response = self.client.post(
            reverse('people:person_edit', args=[self.person.pk]),
            {'name': 'Alicia'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'existe déjà')
        self.person.refresh_from_db()
        self.assertEqual(self.person.name, 'Alice')

    def test_person_edit_and_delete_are_isolated_between_users(self):
        edit_url = reverse('people:person_edit', args=[self.other_person.pk])
        delete_url = reverse('people:person_detail', args=[self.other_person.pk])

        self.assertEqual(self.client.get(edit_url).status_code, 404)
        self.assertEqual(self.client.post(edit_url, {'name': 'Intrus'}).status_code, 404)
        self.assertEqual(self.client.post(delete_url).status_code, 404)
        self.assertTrue(Person.objects.filter(pk=self.other_person.pk).exists())

    def test_face_confirm_assigns_suggested_person(self):
        response = self.client.post(
            reverse('people:face_confirm', args=[self.face.pk])
        )

        self.assertEqual(response.status_code, 302)
        self.face.refresh_from_db()
        self.assertEqual(self.face.person, self.person)

    def test_face_assign_rejects_other_users_face(self):
        response = self.client.post(
            reverse('people:face_assign', args=[self.other_face.pk]),
            {'person': self.person.pk},
        )

        self.assertEqual(response.status_code, 404)
        self.other_face.refresh_from_db()
        self.assertIsNone(self.other_face.person)

    def test_face_assign_rejects_other_users_person(self):
        response = self.client.post(
            reverse('people:face_assign', args=[self.face.pk]),
            {'person': self.other_person.pk},
        )

        self.assertEqual(response.status_code, 404)
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_login_is_required(self):
        self.client.logout()

        response = self.client.get(reverse('people:person_list'))

        self.assertEqual(response.status_code, 302)
        self.assertIn('/accounts/login/', response.url)


class PeopleApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.other_user = User.objects.create_user(username='bob', email='bob@example.com', password='secret')

        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.other_person = Person.objects.create(owner=self.other_user, name='Bob')

        self.photo = create_photo(self.user, 'alice.png')
        self.other_photo = create_photo(self.other_user, 'bob.png')

        self.face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )
        self.other_face = DetectedFace.objects.create(
            photo=self.other_photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.client = APIClient()
        self.client.force_login(self.user)

    def test_person_list_is_filtered_by_user(self):
        response = self.client.get(reverse('people-list'))

        self.assertEqual(response.status_code, 200)
        names = [person['name'] for person in response.json()]
        self.assertEqual(names, ['Alice'])

    def test_person_create_rejects_duplicate_name(self):
        response = self.client.post(reverse('people-list'), {'name': 'Alice'}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('name', response.json())

        response = self.client.post(reverse('people-list'), {'name': 'Alicia'}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Person.objects.filter(owner=self.user, name='Alicia').exists()
        )

    def test_face_patch_assigns_person(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': self.person.pk},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['person']['id'], self.person.pk)
        self.face.refresh_from_db()
        self.assertEqual(self.face.person, self.person)

    def test_api_is_isolated_between_users(self):
        detail_url = reverse('people-detail', args=[self.other_person.pk])
        self.assertEqual(self.client.get(detail_url).status_code, 404)
        self.assertEqual(self.client.delete(detail_url).status_code, 404)
        self.assertTrue(Person.objects.filter(pk=self.other_person.pk).exists())

        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': self.other_person.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

        response = self.client.patch(
            reverse('people-face-detail', args=[self.other_face.pk]),
            {'person': self.person.pk},
            format='json',
        )
        self.assertEqual(response.status_code, 404)


class PeopleModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='secret')
        self.other_user = User.objects.create_user(username='bob', password='secret')
        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.photo = create_photo(self.user)

    def test_person_string_is_its_name(self):
        self.assertEqual(str(self.person), 'Alice')

    def test_detected_face_string_contains_face_and_photo_ids(self):
        face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.assertEqual(
            str(face),
            'Visage %s (photo %s)' % (face.pk, self.photo.pk),
        )

    def test_people_are_ordered_by_name(self):
        Person.objects.create(owner=self.user, name='Zoe')
        Person.objects.create(owner=self.user, name='Bob')

        self.assertEqual(
            list(Person.objects.filter(owner=self.user).values_list('name', flat=True)),
            ['Alice', 'Bob', 'Zoe'],
        )

    def test_owner_and_name_pair_is_unique(self):
        with transaction.atomic():
            with self.assertRaises(IntegrityError):
                Person.objects.create(owner=self.user, name='Alice')

    def test_same_name_is_allowed_for_two_owners(self):
        Person.objects.create(owner=self.other_user, name='Alice')

        self.assertEqual(Person.objects.filter(name='Alice').count(), 2)

    def test_deleting_the_owner_cascades_to_people_photos_and_faces(self):
        face = DetectedFace.objects.create(
            photo=self.photo,
            person=self.person,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.user.delete()

        self.assertFalse(Person.objects.filter(pk=self.person.pk).exists())
        self.assertFalse(MediaFile.objects.filter(pk=self.photo.pk).exists())
        self.assertFalse(DetectedFace.objects.filter(pk=face.pk).exists())

    def test_deleting_a_person_unassigns_faces_but_keeps_them(self):
        face = DetectedFace.objects.create(
            photo=self.photo,
            person=self.person,
            suggested_person=self.person,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.person.delete()
        face.refresh_from_db()

        self.assertIsNone(face.person)
        self.assertIsNone(face.suggested_person)
        self.assertEqual(face.photo, self.photo)

    def test_deleting_a_photo_cascades_to_its_faces(self):
        face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        with self.captureOnCommitCallbacks(execute=True):
            self.photo.delete()

        self.assertFalse(DetectedFace.objects.filter(pk=face.pk).exists())


class MediaLifecycleSignalTests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_root_override = override_settings(
            MEDIA_ROOT=self.media_directory.name,
        )
        self.media_root_override.enable()
        self.addCleanup(self.media_root_override.disable)

        self.user = User.objects.create_user(username='alice', password='secret')

    def upload(self, name='photo.png'):
        with patch('apps.people.signals.process_photo'):
            return MediaFile.objects.create(
                owner=self.user,
                file=image_upload(name),
            )

    def test_detection_failure_is_logged_and_does_not_block_upload(self):
        with patch(
            'apps.people.signals.process_photo',
            side_effect=RuntimeError('detector exploded'),
        ):
            with self.assertLogs('apps.people.signals', level='ERROR') as logs:
                photo = MediaFile.objects.create(
                    owner=self.user,
                    file=image_upload(),
                )

        self.assertTrue(MediaFile.objects.filter(pk=photo.pk).exists())
        self.assertIn('Erreur pendant la detection', logs.output[0])

    def test_deleting_media_removes_the_stored_file(self):
        photo = self.upload()
        stored_path = Path(photo.file.path)
        self.assertTrue(stored_path.exists())

        with self.captureOnCommitCallbacks(execute=True):
            photo.delete()

        self.assertFalse(stored_path.exists())

    def test_deleting_media_keeps_a_file_still_referenced(self):
        photo = self.upload()
        file_name = photo.file.name
        with patch('apps.people.signals.process_photo'):
            duplicate = MediaFile.objects.create(owner=self.user, file=file_name)
        stored_path = Path(self.media_directory.name) / file_name
        self.assertTrue(stored_path.exists())

        with self.captureOnCommitCallbacks(execute=True):
            photo.delete()
        self.assertTrue(stored_path.exists())

        with self.captureOnCommitCallbacks(execute=True):
            duplicate.delete()
        self.assertFalse(stored_path.exists())

    def test_deleting_media_without_a_file_is_safe(self):
        with patch('apps.people.signals.process_photo'):
            photo = MediaFile.objects.create(owner=self.user, file='')

        with self.captureOnCommitCallbacks(execute=True):
            photo.delete()

        self.assertFalse(MediaFile.objects.filter(pk=photo.pk).exists())

    def test_delete_receiver_ignores_an_instance_without_a_file(self):
        from types import SimpleNamespace

        from .signals import delete_media_file

        delete_media_file(MediaFile, SimpleNamespace(file=None))

    def test_delete_receiver_ignores_a_file_without_a_name(self):
        from types import SimpleNamespace

        from .signals import delete_media_file

        delete_media_file(
            MediaFile,
            SimpleNamespace(file=SimpleNamespace(name='', storage=None)),
        )

    def test_cleanup_failure_is_logged(self):
        photo = self.upload()
        storage = photo.file.storage

        with patch.object(storage, 'delete', side_effect=RuntimeError('disk error')):
            with self.assertLogs('apps.people.signals', level='WARNING') as logs:
                with self.captureOnCommitCallbacks(execute=True):
                    photo.delete()

        self.assertIn('Stored file cleanup failed', logs.output[0])

    def test_deleting_a_face_removes_its_crop_file(self):
        photo = self.upload()
        face = DetectedFace.objects.create(
            photo=photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
            face_crop=image_upload('crop.png'),
        )
        crop_path = Path(face.face_crop.path)
        self.assertTrue(crop_path.exists())

        face.delete()

        self.assertFalse(crop_path.exists())


class PeopleApiCrudTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', password='secret')
        self.other_user = User.objects.create_user(username='bob', password='secret')

        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.other_person = Person.objects.create(owner=self.other_user, name='Bob')
        self.photo = create_photo(self.user, 'alice.png')
        self.other_photo = create_photo(self.other_user, 'bob.png')
        self.face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )
        self.other_face = DetectedFace.objects.create(
            photo=self.other_photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.client.force_login(self.user)

    def test_every_endpoint_requires_authentication(self):
        self.client.logout()
        requests = [
            ('get', reverse('people-list')),
            ('post', reverse('people-list')),
            ('get', reverse('people-detail', args=[self.person.pk])),
            ('patch', reverse('people-detail', args=[self.person.pk])),
            ('delete', reverse('people-detail', args=[self.person.pk])),
            ('get', reverse('people-person-photos', args=[self.person.pk])),
            ('get', reverse('people-photo-list')),
            ('get', reverse('people-photo-detail', args=[self.photo.pk])),
            ('patch', reverse('people-face-detail', args=[self.face.pk])),
            ('delete', reverse('people-face-detail', args=[self.face.pk])),
            ('post', reverse('people-face-confirm', args=[self.face.pk])),
        ]

        for method, url in requests:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_person_list_returns_serialized_own_people(self):
        response = self.client.get(reverse('people-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        item = response.data[0]
        self.assertEqual(item['id'], self.person.pk)
        self.assertEqual(item['name'], 'Alice')
        self.assertIn('avatar', item)
        self.assertIn('created_at', item)

    def test_person_create_forces_the_owner_and_returns_201(self):
        response = self.client.post(
            reverse('people-list'),
            {'name': '  Carol  ', 'owner': self.other_user.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Carol')
        person = Person.objects.get(pk=response.data['id'])
        self.assertEqual(person.owner, self.user)

    def test_person_create_rejects_a_blank_name(self):
        response = self.client.post(
            reverse('people-list'),
            {'name': '   '},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_person_detail_get_returns_own_person(self):
        response = self.client.get(
            reverse('people-detail', args=[self.person.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.person.pk)
        self.assertEqual(response.data['name'], 'Alice')

    def test_person_detail_patch_updates_and_validates_the_name(self):
        url = reverse('people-detail', args=[self.person.pk])

        response = self.client.patch(url, {'name': 'Alicia'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.person.refresh_from_db()
        self.assertEqual(self.person.name, 'Alicia')

        response = self.client.patch(url, {'name': '   '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        Person.objects.create(owner=self.user, name='Carol')
        response = self.client.patch(url, {'name': 'Carol'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_person_detail_delete_returns_204_and_unassigns_faces(self):
        self.face.person = self.person
        self.face.save(update_fields=['person'])

        response = self.client.delete(
            reverse('people-detail', args=[self.person.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Person.objects.filter(pk=self.person.pk).exists())
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_person_detail_operations_are_isolated(self):
        url = reverse('people-detail', args=[self.other_person.pk])

        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(
            self.client.patch(url, {'name': 'Intrus'}, format='json').status_code,
            404,
        )
        self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertTrue(Person.objects.filter(pk=self.other_person.pk).exists())

    def test_person_photos_groups_faces_by_photo_and_lists_crops(self):
        self.face.face_crop = 'people/faces/crop-one.jpg'
        self.face.save(update_fields=['face_crop'])
        DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.1] * 128,
            bounding_box=BOUNDING_BOX,
        )
        self.face.person = self.person
        self.face.save(update_fields=['person'])
        DetectedFace.objects.filter(photo=self.photo).exclude(pk=self.face.pk).update(
            person=self.person
        )

        response = self.client.get(
            reverse('people-person-photos', args=[self.person.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        group = response.data[0]
        self.assertEqual(group['id'], self.photo.pk)
        self.assertIn('/media/photos/alice.png', group['photo'])
        self.assertEqual(len(group['crops']), 1)
        self.assertIn('/media/people/faces/crop-one.jpg', group['crops'][0])
        self.assertIn('uploaded_at', group)

    def test_person_photos_is_isolated(self):
        response = self.client.get(
            reverse('people-person-photos', args=[self.other_person.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_photo_list_returns_own_photos_with_face_counts(self):
        response = self.client.get(reverse('people-photo-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        item = response.data[0]
        self.assertEqual(item['id'], self.photo.pk)
        self.assertEqual(item['faces_count'], 1)
        self.assertIn('/media/photos/alice.png', item['photo'])
        self.assertIn('uploaded_at', item)

    def test_photo_detail_returns_faces_and_is_isolated(self):
        response = self.client.get(
            reverse('people-photo-detail', args=[self.photo.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.photo.pk)
        self.assertEqual(len(response.data['faces']), 1)
        face_data = response.data['faces'][0]
        self.assertEqual(face_data['id'], self.face.pk)
        self.assertEqual(face_data['bounding_box'], BOUNDING_BOX)
        self.assertIsNone(face_data['person'])
        self.assertIn('distance', face_data)
        self.assertIn('face_crop', face_data)

        response = self.client.get(
            reverse('people-photo-detail', args=[self.other_photo.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_face_patch_assigns_a_person(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': self.person.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['person']['id'], self.person.pk)
        self.face.refresh_from_db()
        self.assertEqual(self.face.person, self.person)

    def test_face_patch_can_clear_a_person(self):
        self.face.person = self.person
        self.face.save(update_fields=['person'])

        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': None},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['person'])
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_face_patch_requires_the_person_field(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('person', response.data)

    def test_face_patch_rejects_an_invalid_person_id(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': 'not-an-id'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('person', response.data)

    def test_face_patch_rejects_another_users_person(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.face.pk]),
            {'person': self.other_person.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_face_patch_rejects_another_users_face(self):
        response = self.client.patch(
            reverse('people-face-detail', args=[self.other_face.pk]),
            {'person': self.person.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_face.refresh_from_db()
        self.assertIsNone(self.other_face.person)

    def test_face_delete_returns_204_for_own_face_only(self):
        response = self.client.delete(
            reverse('people-face-detail', args=[self.face.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DetectedFace.objects.filter(pk=self.face.pk).exists())

        response = self.client.delete(
            reverse('people-face-detail', args=[self.other_face.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(
            DetectedFace.objects.filter(pk=self.other_face.pk).exists()
        )

    def test_face_confirm_assigns_the_suggested_person(self):
        self.face.suggested_person = self.person
        self.face.distance = 0.2
        self.face.save(update_fields=['suggested_person', 'distance'])

        response = self.client.post(
            reverse('people-face-confirm', args=[self.face.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['person']['id'], self.person.pk)
        self.face.refresh_from_db()
        self.assertEqual(self.face.person, self.person)

    def test_face_confirm_without_a_suggestion_is_a_noop(self):
        response = self.client.post(
            reverse('people-face-confirm', args=[self.face.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['person'])
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_face_confirm_is_isolated(self):
        response = self.client.post(
            reverse('people-face-confirm', args=[self.other_face.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PeopleHtmlViewTests(TestCase):
    def setUp(self):
        self.media_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_directory.cleanup)
        self.media_root_override = override_settings(
            MEDIA_ROOT=self.media_directory.name,
        )
        self.media_root_override.enable()
        self.addCleanup(self.media_root_override.disable)

        self.user = User.objects.create_user(username='alice', password='secret')
        self.other_user = User.objects.create_user(username='bob', password='secret')
        self.person = Person.objects.create(owner=self.user, name='Alice')
        self.other_person = Person.objects.create(owner=self.other_user, name='Bob')
        self.photo = create_photo(self.user, 'alice.png')
        self.other_photo = create_photo(self.other_user, 'bob.png')
        self.face = DetectedFace.objects.create(
            photo=self.photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )
        self.other_face = DetectedFace.objects.create(
            photo=self.other_photo,
            encoding=[0.0] * 128,
            bounding_box=BOUNDING_BOX,
        )

        self.client.force_login(self.user)

    def test_person_list_post_creates_a_stripped_person(self):
        response = self.client.post(
            reverse('people:person_list'),
            {'name': '  Carol  '},
        )

        self.assertRedirects(response, reverse('people:person_list'))
        self.assertTrue(
            Person.objects.filter(owner=self.user, name='Carol').exists()
        )

    def test_person_list_post_ignores_blank_and_duplicate_names(self):
        self.client.post(reverse('people:person_list'), {'name': '   '})
        self.client.post(reverse('people:person_list'), {'name': 'Alice'})

        self.assertEqual(Person.objects.filter(owner=self.user).count(), 1)

    def test_person_detail_post_deletes_the_person(self):
        self.face.person = self.person
        self.face.save(update_fields=['person'])

        response = self.client.post(
            reverse('people:person_detail', args=[self.person.pk])
        )

        self.assertRedirects(response, reverse('people:person_list'))
        self.assertFalse(Person.objects.filter(pk=self.person.pk).exists())
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_person_edit_get_and_blank_validation(self):
        url = reverse('people:person_edit', args=[self.person.pk])

        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Alice')

        response = self.client.post(url, {'name': '   '})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Le nom est obligatoire')
        self.person.refresh_from_db()
        self.assertEqual(self.person.name, 'Alice')

    def test_person_edit_updates_the_avatar(self):
        response = self.client.post(
            reverse('people:person_edit', args=[self.person.pk]),
            {
                'name': 'Alicia',
                'avatar': image_upload('avatar.png', size=(4, 4)),
            },
        )

        self.assertRedirects(
            response,
            reverse('people:person_detail', args=[self.person.pk]),
        )
        self.person.refresh_from_db()
        self.assertEqual(self.person.name, 'Alicia')
        self.assertTrue(self.person.avatar.name.startswith('people/avatars/'))

    def test_photo_list_post_uploads_a_photo(self):
        with patch('apps.people.signals.process_photo'):
            response = self.client.post(
                reverse('people:photo_list'),
                {'photo': image_upload('new.png')},
            )

        self.assertRedirects(response, reverse('people:photo_list'))
        photo = MediaFile.objects.exclude(pk=self.photo.pk).get(owner=self.user)
        self.assertEqual(photo.owner, self.user)

    def test_photo_list_post_without_a_file_redirects(self):
        response = self.client.post(reverse('people:photo_list'))

        self.assertRedirects(response, reverse('people:photo_list'))
        self.assertEqual(MediaFile.objects.filter(owner=self.user).count(), 1)

    def test_photo_list_get_only_lists_own_photos(self):
        response = self.client.get(reverse('people:photo_list'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context['photos']), [self.photo])
        self.assertContains(response, 'Photo #%s' % self.photo.pk)
        self.assertNotContains(response, 'Photo #%s' % self.other_photo.pk)

    def test_photo_delete_requires_post_and_deletes_own_photo(self):
        url = reverse('people:photo_delete', args=[self.photo.pk])

        self.assertEqual(self.client.get(url).status_code, 405)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(url)

        self.assertRedirects(response, reverse('people:photo_list'))
        self.assertFalse(MediaFile.objects.filter(pk=self.photo.pk).exists())

    def test_photo_delete_is_isolated(self):
        response = self.client.post(
            reverse('people:photo_delete', args=[self.other_photo.pk])
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(MediaFile.objects.filter(pk=self.other_photo.pk).exists())

    def test_face_delete_requires_post_and_removes_own_face(self):
        url = reverse('people:face_delete', args=[self.face.pk])

        self.assertEqual(self.client.get(url).status_code, 405)

        response = self.client.post(url)

        self.assertRedirects(
            response,
            reverse('people:photo_detail', args=[self.photo.pk]),
        )
        self.assertFalse(DetectedFace.objects.filter(pk=self.face.pk).exists())

    def test_face_delete_is_isolated(self):
        response = self.client.post(
            reverse('people:face_delete', args=[self.other_face.pk])
        )

        self.assertEqual(response.status_code, 404)
        self.assertTrue(
            DetectedFace.objects.filter(pk=self.other_face.pk).exists()
        )

    def test_face_assign_sets_and_clears_the_person(self):
        url = reverse('people:face_assign', args=[self.face.pk])

        response = self.client.post(url, {'person': self.person.pk})
        self.assertRedirects(
            response,
            reverse('people:photo_detail', args=[self.photo.pk]),
        )
        self.face.refresh_from_db()
        self.assertEqual(self.face.person, self.person)

        self.client.post(url, {'person': ''})
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_face_assign_rejects_an_unknown_person(self):
        response = self.client.post(
            reverse('people:face_assign', args=[self.face.pk]),
            {'person': 999999},
        )

        self.assertEqual(response.status_code, 404)
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_face_confirm_without_suggestion_is_a_noop(self):
        response = self.client.post(
            reverse('people:face_confirm', args=[self.face.pk])
        )

        self.assertRedirects(
            response,
            reverse('people:photo_detail', args=[self.photo.pk]),
        )
        self.face.refresh_from_db()
        self.assertIsNone(self.face.person)

    def test_login_is_required_for_every_html_route(self):
        self.client.logout()
        requests = [
            ('get', reverse('people:person_list')),
            ('post', reverse('people:person_list')),
            ('get', reverse('people:person_detail', args=[self.person.pk])),
            ('post', reverse('people:person_detail', args=[self.person.pk])),
            ('get', reverse('people:person_edit', args=[self.person.pk])),
            ('post', reverse('people:person_edit', args=[self.person.pk])),
            ('get', reverse('people:photo_list')),
            ('post', reverse('people:photo_list')),
            ('get', reverse('people:photo_detail', args=[self.photo.pk])),
            ('post', reverse('people:photo_delete', args=[self.photo.pk])),
            ('post', reverse('people:face_assign', args=[self.face.pk])),
            ('post', reverse('people:face_confirm', args=[self.face.pk])),
            ('post', reverse('people:face_delete', args=[self.face.pk])),
        ]

        for method, url in requests:
            with self.subTest(method=method, url=url):
                response = getattr(self.client, method)(url)
                self.assertEqual(response.status_code, 302)
                self.assertIn('/admin/login/', response.url)
