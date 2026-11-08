"""Map a source's own labels and text onto the app's categories and "vibe" (introvert / extrovert).

Rule-based keywords, so it's transparent and explainable to judges: every tag can be traced to a word.
Tune the lists freely. Swap for an ML/LLM classifier later if you want, keep the same function signature.
"""

import re

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "tech": ["tech", "coding", "code", "python", "javascript", "developer", "software", "ai ", "data", "hackathon", "startup", "robot", "arduino", "web3", "cyber"],
    "social": ["social", "meetup", "mixer", "networking", "community", "friends", "newcomer", "singles", "party", "trivia", "board game"],
    "outdoors": ["outdoor", "hike", "hiking", "walk", "park", "trail", "camping", "climb", "ski", "skate", "garden", "river", "bike", "cycling"],
    "arts": ["arts", "art", "theatre", "theater", "music", "concert", "film", "comedy", "dance", "paint", "gallery", "museum", "opera", "symphony", "photography", "book club", "writing"],
    "food": ["food", "cooking", "brunch", "dinner", "breakfast", "potluck", "beer", "wine", "coffee", "market", "tasting"],
    "sports": ["sports", "sport", "hockey", "soccer", "football", "basketball", "baseball", "pickleball", "run club", "running", "fitness", "volleyball", "flames", "stampeders", "hitmen", "roughnecks", "wrangler"],
    "family": ["family", "kids", "children", "toddler", "parent", "all ages"],
    "learning": ["workshop", "class", "course", "learn", "lecture", "seminar", "talk", "training", "career", "skills", "tutorial", "language exchange"],
    "wellness": ["wellness", "yoga", "meditation", "mindful", "mental health", "health", "pilates", "self-care", "support group"],
    "volunteer": ["volunteer", "clean-up", "cleanup", "charity", "fundraiser", "donate", "food bank", "nonprofit"],
}

INTROVERT_WORDS = ["small group", "quiet", "silent", "book club", "meditation", "yoga", "beginner", "workshop", "low pressure", "walk", "sketch", "knit", "study",
                   # calmer, low-key formats common in Calgary's community and library listings
                   "coffee", "conversation", "tea", "library", "reading", "storytime", "craft", "class", "lecture", "talk", "museum", "gallery",
                   "garden", "paint", "information", "luncheon", "drop-in", "seniors", "volunteer", "puzzle", "writing", "journal"]
EXTROVERT_WORDS = ["concert", "party", "festival", "game", "mixer", "networking", "dance", "nightclub", "stadium", "tournament", "comedy", "live music", "rave",
                   "music", "tour", "hockey", "basketball", "football", "soccer", "lacrosse", "wrestling", " vs"]


def _hits(text: str, words: list[str]) -> int:
    return sum(1 for w in words if re.search(rf"(?<![a-z]){re.escape(w.strip())}(?![a-z])", text))


def categorize(title: str, description: str | None, raw_category: str | None, limit: int = 3) -> list[str]:
    text = f" {title} {raw_category or ''} {(description or '')[:500]} ".lower()
    # The source's own label counts double.
    label = f" {raw_category or ''} ".lower()
    scores = {c: _hits(text, kw) + _hits(label, kw) for c, kw in CATEGORY_KEYWORDS.items()}
    ranked = [c for c, s in sorted(scores.items(), key=lambda kv: -kv[1]) if s > 0]
    return ranked[:limit] or ["social"]


def vibe(title: str, description: str | None, raw_category: str | None) -> str:
    text = f" {title} {raw_category or ''} {(description or '')[:500]} ".lower()
    intro, extro = _hits(text, INTROVERT_WORDS), _hits(text, EXTROVERT_WORDS)
    if intro > extro:
        return "introvert"
    if extro > intro:
        return "extrovert"
    return "either"


def indoor(categories: list[str], title: str) -> bool:
    return not ("outdoors" in categories[:1] or re.search(r"\b(park|trail|hike|outdoor|lake|river)\b", title.lower()))
