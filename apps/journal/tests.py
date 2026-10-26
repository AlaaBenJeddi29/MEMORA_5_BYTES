"""Tests for the journal app.

Covers the JournalEntry model, the owner-scoped CRUD API, authentication,
permissions, isolation between users, search and pagination.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from apps.media_library.models import MediaFile

from .models import JournalEntry
from .views import JournalEntryViewSet

User = get_user_model()


def make_media(owner, name='journal-photo.png'):
    """Create a MediaFile without running the People face-detection signal."""
    with patch('apps.people.signals.process_photo'):
        return MediaFile.objects.create(owner=owner, file='photos/' + name)


class JournalEntryModelTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.other_user = User.objects.create_user(username='bob', email='bob@example.com', password='secret')

    def make_entry(self, user=None, title='Morning', text='A quiet morning.', **kwargs):
        return JournalEntry.objects.create(
            user=user or self.user,
            title=title,
            text=text,
            **kwargs,
        )

    def test_defaults_are_applied(self):
        entry = self.make_entry()

        self.assertEqual(entry.audio_file, '')
        self.assertEqual(entry.summary_text, '')
        self.assertEqual(entry.sentiment, '')
        self.assertIsNotNone(entry.created_at)

    def test_title_and_text_are_required_by_model_validation(self):
        entry = JournalEntry(user=self.user, title='', text='')

        with self.assertRaises(ValidationError) as raised:
            entry.full_clean()

        self.assertIn('title', raised.exception.message_dict)
        self.assertIn('text', raised.exception.message_dict)

    def test_title_length_is_capped_at_255_characters(self):
        entry = JournalEntry(user=self.user, title='x' * 256, text='body')

        with self.assertRaises(ValidationError) as raised:
            entry.full_clean()

        self.assertIn('title', raised.exception.message_dict)

    def test_audio_file_and_sentiment_lengths_are_capped(self):
        entry = JournalEntry(
            user=self.user,
            title='Title',
            text='Body',
            audio_file='x' * 501,
            sentiment='x' * 101,
        )

        with self.assertRaises(ValidationError) as raised:
            entry.full_clean()

        self.assertIn('audio_file', raised.exception.message_dict)
        self.assertIn('sentiment', raised.exception.message_dict)

    def test_entries_are_ordered_newest_first(self):
        old = self.make_entry(title='Old')
        recent = self.make_entry(title='Recent')

        JournalEntry.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=2)
        )
        JournalEntry.objects.filter(pk=recent.pk).update(created_at=timezone.now())

        self.assertEqual(
            list(JournalEntry.objects.values_list('pk', flat=True)),
            [recent.pk, old.pk],
        )

    def test_photos_many_to_many_relation_is_available(self):
        entry = self.make_entry()
        media = make_media(self.user)

        entry.photos.add(media)

        self.assertEqual(list(entry.photos.all()), [media])
        self.assertIn(entry, media.journal_entries.all())

    def test_deleting_a_photo_keeps_the_journal_entry(self):
        entry = self.make_entry()
        media = make_media(self.user)
        entry.photos.add(media)

        with self.captureOnCommitCallbacks(execute=True):
            media.delete()

        self.assertTrue(JournalEntry.objects.filter(pk=entry.pk).exists())
        self.assertEqual(entry.photos.count(), 0)

    def test_deleting_the_user_cascades_to_entries(self):
        entry = self.make_entry()

        self.user.delete()

        self.assertFalse(JournalEntry.objects.filter(pk=entry.pk).exists())


class JournalEntryApiAuthenticationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.entry = JournalEntry.objects.create(
            user=self.user,
            title='Private',
            text='Private body.',
        )
        self.client = APIClient()

    def test_list_requires_authentication(self):
        response = self.client.get(reverse('journal-entry-list'))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_requires_authentication(self):
        response = self.client.post(
            reverse('journal-entry-list'),
            {'title': 'New', 'text': 'Body'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(JournalEntry.objects.count(), 1)

    def test_detail_requires_authentication(self):
        url = reverse('journal-entry-detail', args=[self.entry.pk])

        for method in ('get', 'put', 'patch', 'delete'):
            with self.subTest(method=method):
                response = getattr(self.client, method)(url, {}, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_search_requires_authentication(self):
        response = self.client.get(reverse('journal-entry-search'), {'q': 'Private'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class JournalEntryApiCrudTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.bob = User.objects.create_user(username='bob', email='bob@example.com', password='secret')
        self.alice_entry = JournalEntry.objects.create(
            user=self.alice,
            title='Alice entry',
            text='Alice text.',
        )
        self.bob_entry = JournalEntry.objects.create(
            user=self.bob,
            title='Bob entry',
            text='Bob text.',
        )
        self.client.force_login(self.alice)

    def test_list_returns_only_the_callers_entries(self):
        response = self.client.get(reverse('journal-entry-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [self.alice_entry.pk],
        )

    def test_list_serializes_the_expected_fields(self):
        response = self.client.get(reverse('journal-entry-list'))

        item = response.data['results'][0]
        self.assertEqual(item['id'], self.alice_entry.pk)
        self.assertEqual(item['title'], 'Alice entry')
        self.assertEqual(item['text'], 'Alice text.')
        self.assertEqual(item['user'], 'alice')
        self.assertEqual(item['photos'], [])
        self.assertEqual(item['audio_file'], '')
        self.assertEqual(item['summary_text'], '')
        self.assertEqual(item['sentiment'], '')
        self.assertIn('created_at', item)

    def test_create_forces_the_owner_from_the_request_user(self):
        response = self.client.post(
            reverse('journal-entry-list'),
            {
                'title': 'New entry',
                'text': 'New text.',
                'summary_text': 'A recap.',
                'sentiment': 'positive',
                'audio_file': 'audio/memo.mp3',
                'user': self.bob.pk,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = JournalEntry.objects.get(pk=response.data['id'])
        self.assertEqual(entry.user, self.alice)
        self.assertEqual(entry.summary_text, 'A recap.')
        self.assertEqual(entry.sentiment, 'positive')
        self.assertEqual(entry.audio_file, 'audio/memo.mp3')
        self.assertEqual(response.data['user'], 'alice')

    def test_create_ignores_client_supplied_photos(self):
        media = make_media(self.alice)

        response = self.client.post(
            reverse('journal-entry-list'),
            {'title': 'Entry', 'text': 'Body', 'photos': [media.pk]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = JournalEntry.objects.get(pk=response.data['id'])
        self.assertEqual(entry.photos.count(), 0)
        self.assertEqual(response.data['photos'], [])

    def test_create_rejects_missing_or_invalid_fields(self):
        invalid_payloads = [
            {},
            {'title': 'Only title'},
            {'text': 'Only text'},
            {'title': '', 'text': 'Body'},
            {'title': 'Title', 'text': ''},
            {'title': 'x' * 256, 'text': 'Body'},
            {'title': 'Title', 'text': 'Body', 'audio_file': 'x' * 501},
            {'title': 'Title', 'text': 'Body', 'sentiment': 'x' * 101},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    reverse('journal-entry-list'),
                    payload,
                    format='json',
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(JournalEntry.objects.filter(user=self.alice).count(), 1)

    def test_retrieve_returns_own_entry(self):
        response = self.client.get(
            reverse('journal-entry-detail', args=[self.alice_entry.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.alice_entry.pk)

    def test_retrieve_of_another_users_entry_is_not_found(self):
        response = self.client.get(
            reverse('journal-entry-detail', args=[self.bob_entry.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_patch_updates_own_entry_and_ignores_owner(self):
        response = self.client.patch(
            reverse('journal-entry-detail', args=[self.alice_entry.pk]),
            {'title': 'Updated', 'user': self.bob.pk},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.alice_entry.refresh_from_db()
        self.assertEqual(self.alice_entry.title, 'Updated')
        self.assertEqual(self.alice_entry.user, self.alice)

    def test_patch_of_another_users_entry_is_not_found(self):
        response = self.client.patch(
            reverse('journal-entry-detail', args=[self.bob_entry.pk]),
            {'title': 'Hacked'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.bob_entry.refresh_from_db()
        self.assertEqual(self.bob_entry.title, 'Bob entry')

    def test_put_requires_the_full_payload(self):
        url = reverse('journal-entry-detail', args=[self.alice_entry.pk])

        response = self.client.put(url, {'title': 'Only title'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.put(
            url,
            {'title': 'Replaced', 'text': 'Replaced body.'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.alice_entry.refresh_from_db()
        self.assertEqual(self.alice_entry.title, 'Replaced')
        self.assertEqual(self.alice_entry.text, 'Replaced body.')

    def test_delete_removes_own_entry(self):
        response = self.client.delete(
            reverse('journal-entry-detail', args=[self.alice_entry.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(JournalEntry.objects.filter(pk=self.alice_entry.pk).exists())

    def test_delete_of_another_users_entry_is_not_found(self):
        response = self.client.delete(
            reverse('journal-entry-detail', args=[self.bob_entry.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(JournalEntry.objects.filter(pk=self.bob_entry.pk).exists())


class JournalSearchPaginationTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username='alice', email='alice@example.com', password='secret')
        self.bob = User.objects.create_user(username='bob', email='bob@example.com', password='secret')
        self.client.force_login(self.alice)
        self.now = timezone.now()

    def make_entry(self, title, text='Body', user=None, days_ago=0):
        entry = JournalEntry.objects.create(
            user=user or self.alice,
            title=title,
            text=text,
        )
        if days_ago:
            JournalEntry.objects.filter(pk=entry.pk).update(
                created_at=self.now - timedelta(days=days_ago)
            )
        return entry

    def test_search_matches_title_case_insensitively_and_not_body_only(self):
        title_match = self.make_entry('Alice morning walk')
        body_only = self.make_entry('Evening walk', text='Walked with Alice.')
        self.make_entry('Bob note', user=self.bob)

        response = self.client.get(
            reverse('journal-entry-search'),
            {'q': 'alice'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item['id'] for item in response.data['results']]
        self.assertEqual(ids, [title_match.pk])
        self.assertNotIn(body_only.pk, ids)

    def test_search_filters_by_date_range_inclusively(self):
        recent = self.make_entry('Recent', days_ago=1)
        old = self.make_entry('Old', days_ago=10)
        self.make_entry('Very old', days_ago=20)

        response = self.client.get(
            reverse('journal-entry-search'),
            {
                'date_from': (self.now - timedelta(days=5)).date().isoformat(),
                'date_to': self.now.date().isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item['id'] for item in response.data['results']]
        self.assertEqual(ids, [recent.pk])
        self.assertNotIn(old.pk, ids)

    def test_search_combines_title_and_date_filters(self):
        match = self.make_entry('Alice recent', days_ago=1)
        self.make_entry('Alice old', days_ago=10)
        self.make_entry('Other recent', days_ago=1)

        response = self.client.get(
            reverse('journal-entry-search'),
            {
                'q': 'alice',
                'date_from': (self.now - timedelta(days=5)).date().isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [match.pk],
        )

    def test_search_is_limited_to_the_callers_entries(self):
        self.make_entry('Alice entry')
        self.make_entry('Alice secret', user=self.bob)

        response = self.client.get(reverse('journal-entry-search'), {'q': 'alice'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)

    def test_search_route_is_not_swallowed_by_the_detail_route(self):
        response = self.client.get(reverse('journal-entry-search'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('results', response.data)

    def test_list_is_paginated_ten_per_page_by_default(self):
        for index in range(12):
            self.make_entry(f'Entry {index}')

        response = self.client.get(reverse('journal-entry-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 12)
        self.assertEqual(len(response.data['results']), 10)
        self.assertIsNotNone(response.data['next'])

    def test_page_size_query_parameter_is_honoured(self):
        for index in range(12):
            self.make_entry(f'Entry {index}')

        response = self.client.get(reverse('journal-entry-list'), {'page_size': 5})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 5)

    def test_page_size_is_capped_at_one_hundred(self):
        JournalEntry.objects.bulk_create(
            [
                JournalEntry(user=self.alice, title=f'Entry {index}', text='Body')
                for index in range(105)
            ]
        )

        response = self.client.get(reverse('journal-entry-list'), {'page_size': 1000})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 100)

    def test_invalid_page_returns_not_found(self):
        for index in range(12):
            self.make_entry(f'Entry {index}')

        response = self.client.get(reverse('journal-entry-list'), {'page': 999})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_search_results_are_paginated(self):
        for index in range(3):
            self.make_entry(f'Alice {index}')

        response = self.client.get(
            reverse('journal-entry-search'),
            {'q': 'alice', 'page_size': 1},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 3)
        self.assertEqual(len(response.data['results']), 1)

    def test_search_accepts_a_date_from_bound_only(self):
        recent = self.make_entry('Recent', days_ago=1)
        self.make_entry('Old', days_ago=10)

        response = self.client.get(
            reverse('journal-entry-search'),
            {'date_from': (self.now - timedelta(days=5)).date().isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [recent.pk],
        )

    def test_search_accepts_a_date_to_bound_only(self):
        self.make_entry('Recent', days_ago=1)
        old = self.make_entry('Old', days_ago=10)

        response = self.client.get(
            reverse('journal-entry-search'),
            {'date_to': (self.now - timedelta(days=5)).date().isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item['id'] for item in response.data['results']],
            [old.pk],
        )

    def test_search_without_filters_returns_every_own_entry(self):
        self.make_entry('First')
        self.make_entry('Second')
        self.make_entry('Not mine', user=self.bob)

        response = self.client.get(reverse('journal-entry-search'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)

    def test_search_returns_a_plain_list_when_pagination_is_disabled(self):
        self.make_entry('Alice entry')

        with patch.object(
            JournalEntryViewSet,
            'paginate_queryset',
            return_value=None,
        ):
            response = self.client.get(
                reverse('journal-entry-search'),
                {'q': 'alice'},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual([item['title'] for item in response.data], ['Alice entry'])
