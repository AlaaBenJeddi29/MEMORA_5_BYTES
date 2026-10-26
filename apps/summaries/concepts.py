"""Curated concept lexicon for the local summaries search.

This module is intentionally pure data: it imports neither Django nor the
search engine, so the dictionary can be reviewed, tested, and extended on its
own. ``apps.summaries.search`` normalizes every surface form before looking it
up.

A concept groups a short list of forms that express one idea. ``related`` links
two neighbouring ideas (for example pride and success) so a query can reach a
nearby concept. Relations are lexical hints only: they never assert that two
memories mean the same thing, and the engine scores expansion-only matches
below direct matches.

Mood-related concepts describe how an entry sounds. They are not clinical
categories and are never used to infer a condition.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Concept:
    """One idea and the short list of forms that express it."""

    key: str
    terms: tuple[str, ...]
    related: tuple[str, ...] = ()


CONCEPTS: tuple[Concept, ...] = (
    Concept(
        key="pride",
        terms=("fier", "fière", "fierté", "proud", "pride"),
        related=("success",),
    ),
    Concept(
        key="success",
        terms=(
            "réussite",
            "réussi",
            "réussir",
            "succès",
            "accomplissement",
            "accompli",
            "accomplir",
            "success",
            "successful",
            "achievement",
            "accomplishment",
        ),
        related=("pride",),
    ),
    Concept(
        key="studies",
        terms=(
            "étude",
            "études",
            "étudier",
            "étudiant",
            "école",
            "université",
            "examen",
            "examens",
            "apprentissage",
            "apprendre",
            "school",
            "university",
            "exam",
            "learning",
            "student",
            "diploma",
        ),
    ),
    Concept(
        key="travel",
        terms=(
            "voyage",
            "voyages",
            "voyager",
            "vacances",
            "travel",
            "trip",
            "journey",
            "vacation",
        ),
        related=("discovery",),
    ),
    Concept(
        key="discovery",
        terms=(
            "découverte",
            "découvertes",
            "découvrir",
            "exploration",
            "explorer",
            "discovery",
            "discover",
            "explore",
        ),
        related=("travel",),
    ),
    Concept(
        key="family",
        terms=(
            "famille",
            "familles",
            "familial",
            "parents",
            "proches",
            "fratrie",
            "mère",
            "père",
            "frère",
            "sœur",
            "family",
            "parent",
            "sibling",
            "mother",
            "father",
            "brother",
            "sister",
        ),
    ),
    Concept(
        key="difficulty",
        terms=(
            "difficile",
            "difficulté",
            "difficultés",
            "épreuve",
            "dur",
            "difficult",
            "hard",
            "struggle",
            "challenge",
            "obstacle",
            "problème",
            "crise",
            "échec",
            "surmonter",
            "overcome",
            "résilience",
            "courage",
        ),
    ),
    Concept(
        key="happiness",
        terms=(
            "heureux",
            "heureuse",
            "bonheur",
            "joie",
            "joyeux",
            "joyeuse",
            "happy",
            "happiness",
            "joy",
            "glad",
            "sourire",
            "smile",
        ),
    ),
    Concept(
        key="calm",
        terms=(
            "calme",
            "paisible",
            "tranquille",
            "détendu",
            "calm",
            "peaceful",
            "peace",
            "quiet",
            "serene",
            "relaxed",
        ),
    ),
    Concept(
        key="gratitude",
        terms=(
            "reconnaissant",
            "reconnaissante",
            "reconnaissance",
            "gratitude",
            "grateful",
            "thankful",
        ),
    ),
    Concept(
        key="sadness",
        terms=(
            "triste",
            "tristesse",
            "sad",
            "sadness",
            "unhappy",
            "mélancolique",
            "melancholy",
            "larmes",
            "tears",
        ),
    ),
    Concept(
        key="anxiety",
        terms=(
            "anxieux",
            "anxieuse",
            "anxiété",
            "anxiety",
            "anxious",
            "stress",
            "stressé",
            "stressed",
            "inquiet",
            "inquiète",
            "nervous",
            "peur",
            "fear",
            "afraid",
        ),
    ),
    Concept(
        key="anger",
        terms=(
            "colère",
            "anger",
            "angry",
            "frustration",
            "frustré",
            "irrité",
            "rage",
        ),
    ),
    Concept(
        key="tiredness",
        terms=(
            "fatigue",
            "épuisé",
            "tired",
            "exhausted",
            "drained",
        ),
    ),
    Concept(
        key="optimism",
        terms=(
            "optimiste",
            "optimisme",
            "espoir",
            "espérer",
            "hope",
            "hopeful",
            "confiant",
            "confident",
        ),
    ),
    Concept(
        key="love",
        terms=(
            "amour",
            "aimer",
            "aimé",
            "love",
            "affection",
            "tendresse",
            "tender",
        ),
    ),
    Concept(
        key="loneliness",
        terms=(
            "seul",
            "seule",
            "solitude",
            "lonely",
            "alone",
            "isolé",
            "isolated",
        ),
    ),
    Concept(
        key="excitement",
        terms=(
            "excité",
            "excitation",
            "excited",
            "exciting",
            "enthousiaste",
            "enthusiasm",
        ),
    ),
    Concept(
        key="friendship",
        terms=(
            "ami",
            "amie",
            "amis",
            "amitié",
            "friend",
            "friends",
            "friendship",
            "copain",
            "copine",
        ),
    ),
)

CONCEPTS_BY_KEY: dict[str, Concept] = {
    concept.key: concept for concept in CONCEPTS
}
