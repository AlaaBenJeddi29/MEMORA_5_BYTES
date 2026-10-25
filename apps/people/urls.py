from django.urls import path

from . import views

app_name = 'people'

urlpatterns = [
    path('', views.person_list, name='person_list'),
    path('<int:pk>/', views.person_detail, name='person_detail'),
    path('<int:pk>/edit/', views.person_edit, name='person_edit'),
    path('photos/', views.photo_list, name='photo_list'),
    path('photos/<int:pk>/', views.photo_detail, name='photo_detail'),
    path('photos/<int:pk>/delete/', views.photo_delete, name='photo_delete'),
    path('faces/<int:pk>/assign/', views.face_assign, name='face_assign'),
    path('faces/<int:pk>/confirm/', views.face_confirm, name='face_confirm'),
    path('faces/<int:pk>/delete/', views.face_delete, name='face_delete'),
]
