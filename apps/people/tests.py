from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.media_library.models import MediaFile

from .models import DetectedFace, Person
from .services import suggest_person

User = get_user_model()

BOUNDING_BOX = {'top': 0, 'right': 10, 'bottom': 10, 'left': 0}


def create_photo(owner, name='photo.png'):
    # On evite de lancer la detection pendant les tests.
    with patch('apps.people.signals.process_photo'):
        return MediaFile.objects.create(owner=owner, file='photos/' + name)


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
