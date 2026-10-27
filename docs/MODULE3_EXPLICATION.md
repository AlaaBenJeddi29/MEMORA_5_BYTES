# MEMORA — Module 3 : explication du code

> Document pédagogique basé sur le code réellement présent dans le dépôt.
>
> - Branche inspectée : `module3`
> - HEAD inspecté : `9c1db7a`
> - Arbre de travail propre au moment de l'inspection
> - Aucun fichier de code modifié, aucune migration lancée, aucun test exécuté
> - La branche contient aussi des commits fusionnés de `module4` (timeline, memory-to-art). Le périmètre de ce document est limité au Module 3 : `apps/summaries/` et `frontend/src/features/summaries/`.

## Sommaire

- [Étape 1 — Architecture générale](#étape-1--architecture-générale)
- [Plan des étapes suivantes](#plan-des-étapes-suivantes)
- [Questions de vérification](#questions-de-vérification)

---

## Étape 1 — Architecture générale

### 1. Ce que fait réellement le Module 3

Le Module 3 est le module « résumés de souvenirs ». Le code montre six fonctionnalités :

1. **CRUD des résumés** : créer, lister, consulter, modifier, supprimer.
2. **Génération par IA** : un résumé peut être généré à partir d'une entrée du journal du Module 1 via Gemini.
3. **Recherche par concepts** : recherche locale, déterministe et limitée à l'utilisateur connecté.
4. **Livre de souvenirs interactif** : navigation dans les résumés existants, sans nouvel appel API.
5. **Personnalisation du livre** : couverture, thème, typographie, sauvegardés en base.
6. **Lecture audio** : synthèse vocale du navigateur, sans backend ni Gemini.

Point important : la recherche n'est **pas** une recherche sémantique vectorielle. `apps/summaries/search.py` fait une recherche lexicale enrichie par un petit lexique de concepts bilingue (`apps/summaries/concepts.py`). C'est expliqué dans le docstring de `search.py:1-11`.

### 2. Rôle de chaque brique

| Brique | Rôle dans MEMORA | Où c'est visible |
|---|---|---|
| **React + TypeScript** | Affiche l'interface, gère l'état, déclenche les appels API. C'est une SPA (Single Page Application) : une seule page HTML, la navigation est gérée par React Router. | `frontend/src/features/summaries/pages/SummariesPage.tsx:58`, `frontend/src/app/router.tsx:72` |
| **Django** | Reçoit les requêtes HTTP, applique les règles métier, l'authentification et la persistance. | `config/urls.py:115` monte `apps/summaries/urls.py` |
| **Django REST Framework** | Fournit les `APIView`, les serializers, les permissions `IsAuthenticated`, la pagination et les réponses JSON. | `apps/summaries/views.py:49`, `config/settings.py:392` |
| **SQLite** | Base de données locale du projet, fichier `db.sqlite3`. | `config/settings.py:193-197` |
| **Django Auth** | Utilisateur personnalisé `accounts.User`, session côté serveur, cookie de session. | `config/settings.py:241` |
| **Gemini** | Génère le résumé, l'humeur, les thèmes et le prompt d'illustration. Appelé uniquement par le serveur. | `apps/summaries/services/gemini.py:217` |
| **Web Speech API** | Lit le résumé à voix haute dans le navigateur. Aucun appel réseau. | `frontend/src/features/summaries/speech.ts`, `SummaryAudioPlayer.tsx` |

**Définitions rapides :**

- **Endpoint** : une URL + une méthode HTTP, par exemple `POST /api/summaries/generate/`.
- **Serializer** : objet DRF qui valide le JSON entrant et convertit un modèle Django en JSON sortant.
- **ORM** : couche Django qui transforme `Summary.objects.filter(...)` en requête SQL.
- **Session** : le serveur garde l'identité de l'utilisateur ; le navigateur ne stocke qu'un cookie d'identifiant.
- **CSRF** : protection contre les requêtes forgées depuis un autre site ; le frontend renvoie un jeton dans `X-CSRFToken`.
- **Hook React** : fonction comme `useState` ou `useEffect` qui ajoute un comportement à un composant.
- **Prop** : donnée passée d'un composant parent à un composant enfant.

### 3. Schéma du fonctionnement général

```text
Utilisateur
   │ clique dans l'interface
   ▼
React + TypeScript
SummariesPage (état : summaries, status, dialog)
   │ summariesApi.list() / .generate() / .search()
   ▼
apiClient.fetch
(cookie de session + X-CSRFToken)
   │ HTTP JSON
   ▼
Django : config/urls.py → apps/summaries/urls.py
   ▼
DRF APIView + IsAuthenticated
   │
   ├─ Serializer  → validation
   ├─ ORM Django  → SQLite (Summary, BookPreference)
   ├─ journal_provider → journal.JournalEntry (Module 1)
   └─ services/gemini.py → API Gemini (uniquement pour /generate/)
   ▼
Response JSON
   ▼
React met à jour son état → l'interface se réaffiche
```

Deux fonctionnalités ne suivent pas toute cette chaîne :

```text
MemoryBook / personnalisation visuelle
   → réutilise le tableau `summaries` déjà chargé
   → seul l'enregistrement des préférences appelle /api/summaries/book-preferences/

SummaryAudioPlayer
   → window.speechSynthesis du navigateur
   → aucun appel Django, aucun Gemini, aucun stockage
```

### 4. Exemple concret : afficher la liste des résumés

1. L'utilisateur ouvre `/app/summaries`.
2. `RequireAuth` vérifie l'état de session chargé par `AuthProvider` (`frontend/src/app/guards.tsx:7`, `AuthProvider.tsx:20-46`).
3. `SummariesPage` exécute `useEffect(() => void loadSummaries('initial'), ...)` (`SummariesPage.tsx:115-117`).
4. `loadSummaries` appelle `summariesApi.list()` (`SummariesPage.tsx:104`).
5. `summariesApi.list()` fait `apiRequest<Summary[]>('/api/summaries/')` (`frontend/src/services/summaries.ts:29`).
6. `apiClient` envoie la requête avec `credentials: 'include'` et le jeton CSRF si nécessaire (`apiClient.ts:57-84`).
7. Django monte l'URL vers `SummaryListCreateView` (`apps/summaries/views.py:49`).
8. La vue exécute `Summary.objects.filter(owner=request.user)` (`views.py:55`).
9. Le `SummarySerializer` transforme chaque modèle en JSON (`serializers.py:29`).
10. React reçoit le tableau, appelle `setSummaries(items)` puis affiche les `SummaryCard`.

Si l'on supprimait le filtre `owner=request.user`, tout utilisateur authentifié pourrait lire les résumés des autres : c'est une faille de type **IDOR**. Le filtre est donc une protection de sécurité, pas un simple détail d'affichage.

### 5. Authentification et protection des données

Le code montre une authentification par **session Django** :

- DRF utilise `SessionAuthentication` et `IsAuthenticated` par défaut (`config/settings.py:392-399`).
- Le cookie de session est `HttpOnly` et `SameSite=Lax` (`settings.py:425-430`).
- Le cookie CSRF est lisible par le frontend, qui le renvoie dans `X-CSRFToken` (`settings.py:439`, `apiClient.ts:70-76`).
- `AuthProvider` charge l'utilisateur via `GET /api/accounts/me/` (`AuthProvider.tsx:20-22`).
- Les guards React protègent l'**expérience utilisateur** : ils redirigent vers `/login`. Ils ne sont pas la sécurité réelle ; la sécurité est appliquée par Django.

Les protections réellement présentes dans le Module 3 :

- Liste : `owner=request.user` (`views.py:55`).
- Détail : `get_object_or_404(..., pk=pk, owner=request.user)` (`views.py:146-148`).
- Création manuelle : `serializer.save(owner=request.user)` (`views.py:66`).
- Lien vers une entrée du journal : le queryset du serializer est restreint aux entrées de l'utilisateur (`serializers.py:72-80`).
- Génération : le client n'envoie que `journal_entry_id` ; le provider vérifie l'appartenance (`journal_provider.py:69-78`).
- Préférences du livre : aucune donnée `owner` acceptée depuis le client (`serializers.py:132-146`).
- Gemini : clé côté serveur uniquement, jamais dans le navigateur (`services/gemini.py:269-280`).

### 6. Ce que la documentation dit et ce que le code fait

Le README des summaries est globalement fidèle au code. Deux nuances à retenir pour une soutenance :

- « AI-assisted search » ne signifie pas recherche sémantique par embeddings. Le classement est fait en Python, par mots, accents, formes proches et lexique de concepts.
- L'audio du Module 3 est la **synthèse vocale du navigateur**. Le dossier `apps/audio/` est un autre module (enregistrements et transcription) ; il ne produit pas la lecture audio des pages du livre.
- La branche `module3` contient des fonctionnalités fusionnées de `module4`. Leur présence dans le dépôt ne signifie pas qu'elles appartiennent au Module 3.

---

## Plan des étapes suivantes

- **Étape 2 — Backend** : `models.py`, `serializers.py`, `views.py`, `urls.py`, `journal_provider.py`, `services/gemini.py`, `search.py`, `concepts.py`, migrations et tests.
- **Étape 3 — Frontend** : `SummariesPage`, cartes, dialogues, `MemoryBook`, préférences, `speech.ts`, `apiClient`, types et styles.
- **Étape 4 — Parcours complets et API** : liste, détail, création, génération, recherche, livre, personnalisation, audio.
- **Étape 5 — Base de données, sécurité et tests**.
- **Étape 6 — Fiche de soutenance, 20 questions et explications orales**.

---

## Questions de vérification

1. Dans le parcours « afficher mes résumés », à quel endroit précis le backend garantit-il qu'un utilisateur ne voit que ses propres résumés ?
2. La recherche du Module 3 est-elle une vraie recherche sémantique vectorielle ? Que fait-elle réellement ?
3. Lorsqu'on écoute une page du livre de souvenirs, y a-t-il un appel à Django ou à Gemini ? Qu'est-ce qui produit le son ?
