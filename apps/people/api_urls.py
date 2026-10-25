from django.urls import path

from . import api_views

urlpatterns = [
    path('', api_views.person_list, name='people-list'),
    path('<int:pk>/', api_views.person_detail, name='people-detail'),
    path('<int:pk>/photos/', api_views.person_photos, name='people-person-photos'),
    path('photos/', api_views.photo_list, name='people-photo-list'),
    path('photos/<int:pk>/', api_views.photo_detail, name='people-photo-detail'),
    path('faces/<int:pk>/', api_views.face_detail, name='people-face-detail'),
    path('faces/<int:pk>/confirm/', api_views.face_confirm, name='people-face-confirm'),
]
