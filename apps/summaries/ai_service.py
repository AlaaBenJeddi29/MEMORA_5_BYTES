"""AI-powered features with Groq (ultra-fast) + local fallback."""

import json
import logging
import os
from typing import Any
import time

logger = logging.getLogger(__name__)

# Groq API Key (ultra-fast AI)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_AVAILABLE = bool(GROQ_API_KEY)

if GROQ_AVAILABLE:
    try:
        from groq import Groq as GroqClient
        groq_client = GroqClient(api_key=GROQ_API_KEY)
        logger.info("✅ Groq API configured successfully")
    except Exception as e:
        logger.warning(f"❌ Groq initialization warning: {e}")
        GROQ_AVAILABLE = False


class GeminiError(Exception):
    """Raised when AI API call fails."""
    pass


# Simple in-memory cache
_analysis_cache = {}

# Clear cache function (for testing)
def clear_cache():
    """Clear the analysis cache."""
    global _analysis_cache
    _analysis_cache = {}
    logger.info("✓ Cache cleared")

# Local synonym database (comprehensive)
SYNONYM_DB = {
    "happy": ["happy", "joy", "joyful", "glad", "content", "excited", "delighted", "thrilled", "cheerful"],
    "joy": ["joy", "happy", "joyful", "glad", "delight", "thrilled"],
    "joyful": ["joyful", "happy", "joy", "glad", "cheerful", "delighted"],
    
    "sad": ["sad", "unhappy", "depressed", "gloomy", "down", "blue", "sorrowful", "melancholic"],
    "unhappy": ["unhappy", "sad", "depressed", "gloomy", "down"],
    "depressed": ["depressed", "sad", "unhappy", "gloomy", "blue"],
    
    "calm": ["calm", "peaceful", "relaxed", "serene", "tranquil", "quiet", "still", "centered", "zen"],
    "peaceful": ["peaceful", "calm", "serene", "tranquil", "quiet", "relaxed"],
    "serene": ["serene", "calm", "peaceful", "tranquil", "quiet"],
    "relaxed": ["relaxed", "calm", "peaceful", "serene", "tranquil"],
    
    "stressed": ["stressed", "anxious", "overwhelmed", "tense", "worried", "nervous", "pressured", "agitated"],
    "anxious": ["anxious", "stressed", "worried", "nervous", "tense", "uneasy", "concerned"],
    "nervous": ["nervous", "anxious", "stressed", "worried", "tense", "uneasy"],
    "worried": ["worried", "anxious", "stressed", "nervous", "concerned", "troubled"],
    "tense": ["tense", "stressed", "anxious", "nervous", "tight", "strained"],
    "overwhelmed": ["overwhelmed", "stressed", "anxious", "pressured", "burdened", "flooded"],
    "pressured": ["pressured", "stressed", "overwhelmed", "burdened", "constrained"],
    
    "beach": ["beach", "shore", "sand", "seaside", "coast", "ocean", "sea", "waterfront", "seashore"],
    "shore": ["shore", "beach", "coast", "seaside", "sand", "waterfront"],
    "coast": ["coast", "beach", "shore", "seaside", "coastal"],
    "seaside": ["seaside", "beach", "shore", "coast", "sand", "waterfront"],
    
    "meditation": ["meditation", "mindful", "mindfulness", "calm", "zen", "peaceful", "reflective"],
    "mindful": ["mindful", "meditation", "mindfulness", "aware", "conscious", "present"],
    
    "reflective": ["reflective", "thoughtful", "contemplative", "pensive", "introspective", "meditative"],
    "thoughtful": ["thoughtful", "reflective", "contemplative", "pensive", "considerate"],
    "contemplative": ["contemplative", "reflective", "thoughtful", "pensive", "meditative"],
}


def _call_groq(prompt: str, max_retries: int = 2) -> str:
    """Call Groq API (ultra-fast) using correct SDK."""
    if not GROQ_AVAILABLE:
        raise GeminiError("Groq API not available")
    
    # Try multiple models (ordered by quality/speed tradeoff for this account)
    models_to_try = [
        "openai/gpt-oss-120b",     # Highest quality (if available)
        "openai/gpt-oss-20b",      # Good quality, fast
        "qwen/qwen3.8-27b",        # Qwen alternative
        "allam-2-7b",              # Fast fallback
    ]
    
    for attempt in range(max_retries):
        for model in models_to_try:
            try:
                logger.info(f"[Groq] Trying model: {model}")
                # Groq uses chat.completions (like OpenAI)
                completion = groq_client.chat.completions.create(
                    model=model,
                    max_tokens=500,
                    messages=[
                        {"role": "user", "content": prompt}
                    ]
                )
                
                if completion.choices[0].message.content:
                    logger.info(f"[Groq] Success with model: {model}")
                    return completion.choices[0].message.content.strip()
                else:
                    raise GeminiError("Empty response from Groq")
                    
            except Exception as e:
                logger.warning(f"[Groq] Model {model} failed: {type(e).__name__}: {str(e)[:100]}")
                continue
        
        if attempt < max_retries - 1:
            time.sleep(0.3)
    
    raise GeminiError(f"All Groq models failed")


def _get_search_synonyms(query: str) -> list[str]:
    """Get synonyms using Groq AI (with local fallback)."""
    cache_key = f"synonyms_{query.lower()}"
    if cache_key in _analysis_cache:
        logger.info(f"✓ Cache hit: {query}")
        return _analysis_cache[cache_key]
    
    # Try Groq first for AI-generated synonyms
    if GROQ_AVAILABLE:
        try:
            logger.info(f"🚀 Generating synonyms with Groq for '{query}'")
            prompt = f"""Generate 8-12 synonyms and related words for: "{query}"

Return ONLY a JSON array like this:
["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8"]

Include the original word and ALL closely related emotional/semantic synonyms.
For stress-related words, include: stressed, anxious, worried, nervous, tense, overwhelmed, uneasy, apprehensive
For happy-related words, include: happy, joyful, content, delighted, excited, glad, cheerful, elated

NO other text, just the JSON array."""

            response_text = _call_groq(prompt)
            response_text = response_text.strip().strip("`").strip()
            
            # Extract JSON array
            if "[" in response_text:
                response_text = response_text[response_text.index("["):response_text.rindex("]")+1]
            
            if response_text.startswith("json"):
                response_text = response_text[4:].strip()
            
            # Parse and validate
            terms = json.loads(response_text)
            if isinstance(terms, list) and len(terms) > 0:
                _analysis_cache[cache_key] = terms
                logger.info(f"✅ Groq generated synonyms for '{query}': {terms}")
                return terms
            
        except Exception as e:
            logger.warning(f"⚠️  Groq synonyms failed: {e}, falling back to local DB")
    
    # Fallback to local database
    logger.info(f"📚 Using local SYNONYM_DB for '{query}'")
    query_lower = query.lower()
    terms = set([query_lower])
    
    for word in query.lower().split():
        if word in SYNONYM_DB:
            terms.update(SYNONYM_DB[word])
            logger.info(f"✓ Found direct match for '{word}': {SYNONYM_DB[word]}")
        else:
            # Reverse lookup: find which synonym group this word belongs to
            for key, synonyms in SYNONYM_DB.items():
                if word in synonyms:
                    terms.update(synonyms)
                    logger.info(f"✓ Found '{word}' in group '{key}': {synonyms}")
                    break
    
    result = list(terms)
    _analysis_cache[cache_key] = result
    logger.info(f"✓ Synonym lookup for '{query}': {result}")
    return result


def analyze_search_query(query: str) -> dict[str, Any]:
    """Analyze search query using Groq AI (with local fallback)."""
    cache_key = f"query_{query.lower()}"
    if cache_key in _analysis_cache:
        return _analysis_cache[cache_key]
    
    # Try Groq for intelligent analysis
    if GROQ_AVAILABLE:
        try:
            logger.info(f"🚀 Analyzing query with Groq: '{query}'")
            prompt = f"""Analyze this journal search query: "{query}"

Extract sentiments and related themes.
Return ONLY valid JSON like this:
{{
  "sentiments": ["happy", "joyful"],
  "themes": ["summer", "vacation", "beach"]
}}

NO other text, just JSON."""

            response_text = _call_groq(prompt)
            response_text = response_text.strip().strip("`")
            if response_text.startswith("json"):
                response_text = response_text[4:].strip()
            
            result = json.loads(response_text)
            result["sentiments"] = result.get("sentiments", []) or []
            result["themes"] = result.get("themes", []) or []
            result["keywords"] = result.get("keywords", result.get("themes", []))
            
            _analysis_cache[cache_key] = result
            logger.info(f"✅ Groq analysis: {result}")
            return result
            
        except Exception as e:
            logger.warning(f"⚠️  Groq analysis failed: {e}, using local fallback")
    
    # Fallback: local analysis
    logger.info(f"📚 Using local analysis for '{query}'")
    keywords = query.lower().split()
    common_words = {'the', 'a', 'an', 'and', 'or', 'is', 'was', 'i', 'me', 'my', 'at', 'in', 'on', 'to', 'for', 'with', 'from', 'be', 'are'}
    keywords = [w for w in keywords if w not in common_words and len(w) > 2]
    
    # Add synonyms to themes
    themes_with_synonyms = set(keywords)
    for word in keywords:
        if word in SYNONYM_DB:
            themes_with_synonyms.update(SYNONYM_DB[word])
            logger.info(f"✓ Added synonyms for '{word}': {SYNONYM_DB[word]}")
    
    sentiments = _extract_sentiments_simple(query)
    
    result = {
        "sentiments": sentiments,
        "themes": list(themes_with_synonyms),
        "keywords": keywords,
    }
    
    _analysis_cache[cache_key] = result
    logger.info(f"✓ Local query analysis complete: {result}")
    return result


def _extract_sentiments_simple(text: str) -> list[str]:
    """Extract sentiments from text (local)."""
    text_lower = text.lower()
    
    happy_words = {'happy', 'joy', 'joyful', 'excited', 'great', 'wonderful', 'amazing', 'love', 'awesome', 'beautiful', 'glad'}
    sad_words = {'sad', 'depressed', 'down', 'unhappy', 'terrible', 'awful', 'miserable', 'gloomy', 'blue'}
    calm_words = {'calm', 'peaceful', 'relaxed', 'quiet', 'still', 'serene', 'tranquil', 'meditation', 'mindful'}
    stressed_words = {'stress', 'anxious', 'worried', 'nervous', 'overwhelmed', 'panic', 'pressure', 'deadline'}
    
    text_words = set(text_lower.split())
    sentiments = []
    
    if text_words & happy_words:
        sentiments.append("happy")
    if text_words & sad_words:
        sentiments.append("sad")
    if text_words & calm_words:
        sentiments.append("calm")
    if text_words & stressed_words:
        sentiments.append("stressed")
    
    return sentiments


def generate_search_summary(entries_data: list[dict], query: str) -> str:
    """Generate summary (local for speed)."""
    if not entries_data:
        return ""
    
    cache_key = f"summary_{query}_{len(entries_data)}"
    if cache_key in _analysis_cache:
        return _analysis_cache[cache_key]
    
    count = len(entries_data)
    summaries = [
        f"Found {count} {'entry' if count == 1 else 'entries'} matching '{query}'.",
        f"You found {count} {'memory' if count == 1 else 'memories'} related to '{query}'.",
        f"Your search for '{query}' returned {count} {'result' if count == 1 else 'results'}.",
    ]
    
    summary = summaries[count % len(summaries)]
    _analysis_cache[cache_key] = summary
    return summary


def find_similar_entries(entry_text: str, other_entries: list[dict]) -> list[dict]:
    """Find similar entries based on keywords."""
    if not other_entries:
        return []
    
    entry_words = set(entry_text.lower().split())
    similar_ids = []
    
    for other in other_entries[:10]:
        other_words = set(other.get('text', '').lower().split())
        similarity = len(entry_words & other_words) / max(len(entry_words | other_words), 1)
        
        if similarity > 0.2:
            similar_ids.append(other['id'])
    
    return similar_ids[:3]


def extract_themes_from_entry(entry_text: str) -> list[str]:
    """Extract main themes from an entry."""
    common_words = {'very', 'really', 'thing', 'that', 'this', 'have', 'just', 'what', 'about', 'today'}
    words = entry_text.lower().split()
    themes = [w.strip('.,!?;:') for w in words if len(w) > 4 and w.strip('.,!?;:').lower() not in common_words]
    
    return list(set(themes))[:5]


def analyze_sentiment(text: str) -> str:
    """Analyze sentiment of a journal entry."""
    text_lower = text.lower()
    
    happy_words = {'happy', 'joy', 'joyful', 'excited', 'great', 'wonderful', 'amazing', 'love', 'awesome', 'beautiful'}
    sad_words = {'sad', 'depressed', 'down', 'unhappy', 'terrible', 'awful', 'miserable', 'gloomy', 'blue'}
    calm_words = {'calm', 'peaceful', 'relaxed', 'quiet', 'still', 'serene', 'tranquil', 'meditation', 'mindful'}
    stressed_words = {'stress', 'anxious', 'worried', 'nervous', 'overwhelmed', 'panic', 'pressure', 'deadline'}
    
    text_words = set(text_lower.split())
    
    counts = [
        (len(text_words & happy_words), "happy"),
        (len(text_words & sad_words), "sad"),
        (len(text_words & calm_words), "calm"),
        (len(text_words & stressed_words), "stressed"),
    ]
    
    max_count, sentiment = max(counts, key=lambda x: x[0])
    
    return sentiment if max_count > 0 else "neutral"
