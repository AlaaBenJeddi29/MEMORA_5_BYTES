from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.media_library.models import MediaFile

from .models import DetectedFace, Person


@login_required
def person_list(request):
    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        avatar = request.FILES.get('avatar')
        if name and not Person.objects.filter(owner=request.user, name=name).exists():
            Person.objects.create(owner=request.user, name=name, avatar=avatar)
        return redirect('people:person_list')

    people = Person.objects.filter(owner=request.user).order_by('name')
    return render(request, 'people/person_list.html', {'people': people})


@login_required
def person_detail(request, pk):
    person = get_object_or_404(Person, pk=pk, owner=request.user)

    if request.method == 'POST':
        person.delete()
        return redirect('people:person_list')

    faces = DetectedFace.objects.filter(
        person=person,
        photo__owner=request.user,
    ).select_related('photo')

    return render(request, 'people/person_detail.html', {
        'person': person,
        'faces': faces,
    })


@login_required
def person_edit(request, pk):
    person = get_object_or_404(Person, pk=pk, owner=request.user)

    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        avatar = request.FILES.get('avatar')

        if not name:
            error = 'Le nom est obligatoire.'
        elif Person.objects.filter(owner=request.user, name=name).exclude(pk=person.pk).exists():
            error = 'Une personne avec ce nom existe déjà.'
        else:
            person.name = name
            if avatar is not None:
                person.avatar = avatar
            person.save()
            return redirect('people:person_detail', pk=person.pk)

        person.name = name
        return render(request, 'people/person_edit.html', {
            'person': person,
            'error': error,
        })

    return render(request, 'people/person_edit.html', {'person': person})


@login_required
def photo_list(request):
    if request.method == 'POST':
        photo = request.FILES.get('photo')
        if photo is not None:
            MediaFile.objects.create(owner=request.user, file=photo)
        return redirect('people:photo_list')

    photos = MediaFile.objects.filter(
        owner=request.user,
    ).prefetch_related('faces').order_by('-created_at')

    return render(request, 'people/photo_list.html', {'photos': photos})


@login_required
def photo_detail(request, pk):
    photo = get_object_or_404(MediaFile, pk=pk, owner=request.user)
    faces = photo.faces.select_related('person', 'suggested_person')
    people = Person.objects.filter(owner=request.user).order_by('name')

    return render(request, 'people/photo_detail.html', {
        'photo': photo,
        'faces': faces,
        'people': people,
    })


@login_required
@require_POST
def photo_delete(request, pk):
    photo = get_object_or_404(MediaFile, pk=pk, owner=request.user)
    photo.delete()
    return redirect('people:photo_list')


@login_required
@require_POST
def face_delete(request, pk):
    face = get_object_or_404(DetectedFace, pk=pk, photo__owner=request.user)
    photo_id = face.photo_id
    face.delete()
    return redirect('people:photo_detail', pk=photo_id)


@login_required
@require_POST
def face_assign(request, pk):
    face = get_object_or_404(DetectedFace, pk=pk, photo__owner=request.user)
    person_id = request.POST.get('person')

    if person_id:
        person = get_object_or_404(Person, pk=person_id, owner=request.user)
        face.person = person
    else:
        face.person = None

    face.save()
    return redirect('people:photo_detail', pk=face.photo_id)


@login_required
@require_POST
def face_confirm(request, pk):
    face = get_object_or_404(DetectedFace, pk=pk, photo__owner=request.user)

    if face.suggested_person_id is not None:
        face.person = face.suggested_person
        face.save()

    return redirect('people:photo_detail', pk=face.photo_id)
