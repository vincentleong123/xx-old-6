"""
Bulk Video Description Generator
Generates SEO-optimized descriptions for two audiences:
  Tier 1 (Amateur English) — US/UK/CA/AU, "xAmateur" branding
  Tier 3 (Malay/Asian)     — MY/ID/BN/SG, "xMelayu"/"xxMalay" branding
"""

import json
import random
import os
import re

DESCRIPTIONS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-descriptions.json"
)
VIDEO_INDEX_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-index.json"
)
EN_INDEX_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-index-xamateur.json"
)

TIER1_KEYWORDS = ["amateur", "american", "usa", "united states", "uk", "europe", "euro", "western", "homemade"]
TIER1_CATEGORIES = {"Reality", "Public", "Bondage", "Group", "Interracial", "Couple"}

TIER3_INDICATORS = ["tudung", "awek", "bini", "janda", "melayu", "melayu", "ustazah",
                    "kampung", "malay", "selangor", "kedah", "sabah", "sarawak", "kl",
                    "hijab", "muslimah", "bocor", "skandal", "pancut", "kulum", "henjut"]


def is_tier1(video):
    cat = video.get("category", "")
    if cat in TIER1_CATEGORIES:
        return True
    kw = " ".join(k.lower() for k in (video.get("keywords", []) or video.get("subTags", [])))
    for t in TIER1_KEYWORDS:
        if t in kw:
            return True
    return False


def is_tier3(video):
    kw = " ".join(k.lower() for k in (video.get("keywords", []) or video.get("subTags", [])))
    title = video.get("title", "").lower()
    text = kw + " " + title
    for t in TIER3_INDICATORS:
        if t in text:
            return True
    # Fallback: if category contains Malay indicators
    cat = video.get("category", "").lower()
    if "malay" in cat or "hijab" in cat:
        return True
    return False


# ─── Tier 1: Amateur English (xAmateur brand) ──────────────────────────────

TIER1 = {
    "intro": [
        "Check out this {adj} amateur video featuring {subject} — real {theme} action captured in {location}.",
        "Watch {subject} in this {adj} homemade {theme} clip straight from {location}.",
        "If you're into {theme}, you'll love this {adj} amateur video of {subject} filmed in {location}.",
        "Exclusive {adj} amateur footage of {subject} getting {action} in {location}.",
        "This {adj} {theme} video shows {subject} {action} — real amateur chemistry at its best.",
        "Get a glimpse of {subject} in this {adj} homemade {theme} video, recorded in {location}.",
        "True amateur {theme} content: {subject} {action} in this {adj} clip from {location}.",
        "Watch the full {adj} amateur experience as {subject} {action} in this raw {theme} video.",
        "A {adj} {theme} session with {subject} that feels incredibly real. Shot in {location}.",
        "Real amateur passion: {subject} {action} in this {adj} {theme} video that holds nothing back.",
    ],
    "subject": [
        "a real amateur couple", "a stunning college girl", "an experienced MILF",
        "a hot wife next door", "a young amateur model", "a gorgeous fitness girl",
        "your favorite blonde", "a cute brunette", "a tanned beach babe",
        "an athletic redhead", "a curvy amateur", "a natural beauty",
        "a shy first-timer", "an adventurous couple", "a passionate lover",
    ],
    "location": [
        "a cozy bedroom", "a private basement", "a beachside hotel",
        "a college dorm", "a suburban home", "a lakeside cabin",
        "a luxury apartment", "a quiet motel", "a backyard patio",
        "a living room couch", "a master bedroom", "a vacation rental",
        "a private studio", "a beach house", "a forest clearing",
    ],
    "theme": [
        "amateur couple", "homemade", "real amateur", "authentic",
        "genuine amateur", "true amateur", "raw", "uncensored",
    ],
    "adjective": [
        "steamy", "intense", "passionate", "wild", "explicit",
        "hot", "sizzling", "erotic", "seductive", "forbidden",
    ],
    "action": [
        "exploring their wildest fantasies", "going all the way",
        "getting hot and heavy", "letting loose completely",
        "spicing things up", "making their own content",
        "sharing an intimate moment", "living out their desires",
        "getting naughty on camera", "giving in to temptation",
        "enjoying some private time", "recording a memorable encounter",
    ],
}


# ─── Tier 3: Malay/Asian (xMelayu / xxMalay brand) ─────────────────────────

TIER3 = {
    "intro": [
        "Ceritaape with {adj} {subject} yang {action}! More at xMelayu.",
        "This {subject} damn {adj} la, {action} sampai {reaction}! xMelayu punya koleksi.",
        "Dah lama nak share this {adj} {subject} {action} — xxMalay terbaru!",
        "Last week saya jumpa {adj} {subject} {action} gila! Koleksi xxMelayu.",
        "Tengok la this {subject} {adj} ni, {action} sampai {reaction}! Follow xMelayu.",
        "Confirm confirm {action}, {subject} {adj} ni memang tak dapat tahan! xxMalay.",
        "Gila-gila je cerita ni, {adj} {subject} {action} — eksklusif di xMelayu.",
        "Saya tak expected this, {adj} sangat {subject} {action}! xxMelayu original.",
        "This one confirm tak dapat miss, {adj} {subject} {action}! Jom layan xMelayu.",
        "OMG tengok this {subject}, {action} gila {adj}! Full video kat xMelayu.",
        "Korang pernah tak rasa macam ni? {adj} {subject} {action}! xxMalay site.",
        "What do you think about this? {adj} {subject} {action} dari koleksi xxMelayu.",
        "Mahu tau apa jadi dekat {location}? {adj} {subject} {action} — xMelayu.",
        "Dapat dapat this {subject} {action}, memang {adj} la! xxMalay videos.",
        "Tengok apa {subject} buat dekat {location}, memang {adj}! Koleksi xxMelayu.",
        "You won't believe this! {adj} {subject} {action} — hanya di xMelayu.",
        "Siao lah tengok {subject} ni, {action} sampai {reaction}! xxMelayu punya.",
        "Gempak! {subject} {action} straight away, so {adj}! xMelayu site.",
        "Best part is {subject} {action} while {adj}! Jangan lupa xxMalay.",
        "So this {subject} decide to {action}, {adj} gila! Full di xMelayu.",
        "Di {location} berlaku sesuatu yang {adj}! xxMelayu koleksi terkini.",
        "This {subject} somewhere in {location} {action}! Layannn kat xMelayu.",
    ],
    "action": [
        "main dengananton", "layan hasta", "kasi habuan", "pancut dalam",
        "kulum kontol", "hisap pepek", "gigit tetek", "pejam mata nikmat",
        "baring sambil complain", "mahu lagi", "tak boleh tahan",
        "gatal nak main", "masuk bilik", "buka kaki lebar",
        "bogel depan kamera", "gila main", "teruja nak kacau",
        "mahu dihentam", "layan customer", "try something new",
        "go all the way", "feel the moment", "play with fire",
        "cross the line", "lose control", "ride the wave",
    ],
    "subject": [
        "awek tudung", "makcik montage", "janda gersang", "bini orang",
        "ustazah muda", "awek cantik", "kakak jiran", "pelajar UITM",
        "budak kolej", "makcik RM10", "awek factory", "bini mangsa",
        "puteri karang", "cikgulah muda", "nurse hospital", "sales girl",
        "gadis malaya", "awek kelantanese", "puteri johor", "bombay indon",
        "awek montok", "bini simpanan", "awek pejabat",
    ],
    "location": [
        "dalam bilik sewa", "homestay dekat", "hotel murah", "flat PPR",
        "rumah ancestor", "parking lot", "toilet public", "kilang start",
        "dalam kereta", "bilik air", "kantin kolej", "kampus UITM",
        "kampung lama", "atas katil", "bawah stairs", "dalam wardrobe",
        "bilik AC", "rumah kedai",
    ],
    "adjective": [
        "sempoi", "hot gila", "gatal", "geram", "seksi", "bogel comel",
        "mantap", "power", "gempak", "gila babi", "tak dapat tahan",
        "nak kasi", "kasi habisan", "laju punya", "keras jangan",
        "lembut sangat", "rapuh jiwa", "geram hati", "teruja matta",
        "menakjubkan", "luar biasa", "meletup", "meletus",
    ],
    "reaction": [
        "tak boleh tidur", "tak tahan nak tengok", "nak lagi",
        "meletup otak", "habis segala", "sakit pinggang",
        "terketar2", "tak boleh blah", "tak boleh cakap",
        "nak pengsan", "tegang gila", "bangun sendiri",
        "pepek rasa", "need more", "mind blown", "go crazy",
    ],
    "comparison": [
        "langsa", "babi", "gajah", "semut", "buaya", "monyet",
        "lembu", "harimau", "nothing", "ever before", "the movies",
        "imagination", "fantasy",
    ],
}


def random_item(arr):
    return random.choice(arr)


def find_match(keywords, template_list):
    for kw in keywords:
        kw_lower = kw.lower()
        for t in template_list:
            if kw_lower in t or t in kw_lower:
                return kw
    return None


def generate_tier1(keywords, video_title=""):
    kw = [k.lower().strip() for k in keywords if k]
    subject = find_match(kw, TIER1["subject"]) or random_item(TIER1["subject"])
    location = random_item(TIER1["location"])
    theme = find_match(kw, TIER1["theme"]) or random_item(TIER1["theme"])
    adj = find_match(kw, TIER1["adjective"]) or random_item(TIER1["adjective"])
    action = find_match(kw, TIER1["action"]) or random_item(TIER1["action"])

    template = random_item(TIER1["intro"])
    desc = template.replace("{subject}", subject).replace("{location}", location)
    desc = desc.replace("{theme}", theme).replace("{adj}", adj).replace("{action}", action)
    desc = " ".join(desc.split()).strip()
    desc = desc[0].upper() + desc[1:] if desc else desc
    return desc


def generate_tier3(keywords, video_title=""):
    kw = [k.lower().strip() for k in keywords if k]
    subject = find_match(kw, TIER3["subject"]) or random_item(TIER3["subject"])
    location = find_match(kw, TIER3["location"]) or (
        random.random() > 0.5 and random_item(TIER3["location"]) or ""
    )
    action = find_match(kw, TIER3["action"]) or random_item(TIER3["action"])
    adj = find_match(kw, TIER3["adjective"]) or random_item(TIER3["adjective"])
    reaction = find_match(kw, TIER3["reaction"]) or random_item(TIER3["reaction"])
    comparison = random_item(TIER3["comparison"])

    template = random_item(TIER3["intro"])
    desc = template.replace("{subject}", subject).replace("{action}", action)
    desc = desc.replace("{location}", location).replace("{adj}", adj)
    desc = desc.replace("{reaction}", reaction).replace("{comparison}", comparison)
    desc = " ".join(desc.split()).strip()
    desc = desc[0].upper() + desc[1:] if desc else desc
    return desc


def add_emoji(desc, keywords):
    kw_text = " ".join(k.lower() for k in keywords)
    emojis = ""
    if any(w in kw_text for w in ["viral", "bocor", "leaked", "exposed"]):
        emojis += "🔥"
    if any(w in kw_text for w in ["tudung", "hijab", "muslimah"]):
        emojis += "🧕"
    if any(w in kw_text for w in ["malay", "melayu", "kelantan", "selangor", "kl"]):
        emojis += "🇲🇾"
    if any(w in kw_text for w in ["janda", "duda", "balu"]):
        emojis += "💔"
    if any(w in kw_text for w in ["couple", "romantic"]):
        emojis += "💕"
    if any(w in kw_text for w in ["bdsm", "bondage", "rough"]):
        emojis += "⛓️"
    if any(w in kw_text for w in ["outdoor", "public", "car"]):
        emojis += "🌳"
    if emojis:
        return f"{desc}\n\n{emojis}"
    return desc


def generate_description(keywords, video_title="", category=""):
    dummy = {"keywords": keywords, "title": video_title, "category": category}
    tier1 = is_tier1(dummy) and not is_tier3(dummy)
    if tier1:
        desc = generate_tier1(keywords, video_title)
    else:
        desc = generate_tier3(keywords, video_title)
    desc = add_emoji(desc, keywords)
    return desc


def process_index(index_path, descriptions, args):
    if not os.path.exists(index_path):
        print(f"⚠️  Index not found: {index_path}")
        return 0

    print(f"Loading {index_path}...")
    with open(index_path, "r", encoding="utf-8") as f:
        videos = json.load(f)
    print(f"📹 Found {len(videos)} videos")

    generated = 0
    skipped = 0
    start_time = __import__("time").time()
    max_generate = args.count

    for video in videos:
        if max_generate > 0 and generated >= max_generate:
            print(f"✅ Reached max limit of {max_generate} descriptions")
            break

        video_id = video["id"]

        if not args.force and video_id in descriptions.get("descriptions", {}):
            skipped += 1
            continue

        keywords = video.get("keywords", []) or video.get("subTags", [])
        title = video.get("title", "") or video.get("name", "")
        category = video.get("category", "")

        options = [
            generate_description(keywords, title, category)
            for _ in range(3)
        ]
        description = random.choice(options)

        descriptions["descriptions"][video_id] = {
            "text": description,
            "keywords": keywords,
            "autoGenerated": True,
            "regenerated": args.force,
            "updatedAt": __import__("datetime").datetime.now().isoformat(),
        }
        generated += 1

        if generated % 500 == 0:
            print(f"✅ Generated {generated} descriptions...")

    elapsed = __import__("time").time() - start_time
    print(f"   Generated: {generated}  Skipped: {skipped}  Time: {elapsed:.1f}s")
    return generated


def main():
    import io
    import sys as _sys
    import argparse

    _sys.stdout = io.TextIOWrapper(_sys.stdout.buffer, encoding="utf-8")

    parser = argparse.ArgumentParser(description="Generate video descriptions")
    parser.add_argument("--force", "-f", action="store_true",
                        help="Regenerate ALL descriptions")
    parser.add_argument("--count", "-c", type=int, default=0,
                        help="Max descriptions to generate (0 = no limit)")
    parser.add_argument("--english", "-e", action="store_true",
                        help="Also process English amateur index if it exists")
    args = parser.parse_args()

    if args.count == 0:
        print("🚀 Generating descriptions for ALL videos (no count limit)")
        print("   Tip: use --count N to limit, or break early with Ctrl+C")
    else:
        print(f"🚀 Generating up to {args.count} descriptions")

    print("📝 Loading existing descriptions...")
    descriptions = {"descriptions": {}}
    if os.path.exists(DESCRIPTIONS_FILE) and not args.force:
        with open(DESCRIPTIONS_FILE, "r", encoding="utf-8") as f:
            descriptions = json.load(f)
        print(f"📄 Found {len(descriptions.get('descriptions', {}))} existing")
    else:
        if args.force:
            print("⚡ FORCE MODE: Regenerating ALL descriptions!")
        else:
            print("📄 Starting fresh")

    total = process_index(VIDEO_INDEX_FILE, descriptions, args)

    if args.english:
        total += process_index(EN_INDEX_FILE, descriptions, args)

    with open(DESCRIPTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(descriptions, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Done! Total descriptions: {len(descriptions['descriptions'])}")


if __name__ == "__main__":
    main()
