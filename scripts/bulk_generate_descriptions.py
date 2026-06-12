"""
Bulk Video Description Generator
SEO-optimized descriptions with clean keywords, no stuffing
"""

import json
import random
import os
import re
import io
import sys
import argparse
from time import time as _time
from datetime import datetime

DESCRIPTIONS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-descriptions.json"
)
VIDEO_INDEX_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-index.json"
)
EN_INDEX_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "video-index-xamateur.json"
)

GENERIC_FILLER = {"viral", "views", "2026", "2025", "2024", "10m", "5m", "3juta", "hd", "4k", "1080p"}
HEX_PATTERN = re.compile(r'^[0-9a-f]{4,8}$', re.IGNORECASE)


def clean_keywords(kws, max_kw=10):
    if not kws:
        return []
    seen = set()
    result = []
    for kw in kws:
        k = kw.strip().lower()
        if not k or len(k) < 2:
            continue
        if HEX_PATTERN.match(k):
            continue
        if k in GENERIC_FILLER:
            continue
        if k in seen:
            continue
        seen.add(k)
        result.append(kw.strip())
        if len(result) >= max_kw:
            break
    return result


# ─── Tier 1: English Amateur ──────────────────────────────────────────────

TIER1_INTRO = [
    "Scenes from {location} — {subject}, {adj}, {action}. More at xAmateur.",
    "{subject} {action} in {location}. {adj} {theme} clip on xmateur.",
    "A {adj} {theme} clip: {subject} {action} in {location}. x amateur.",
    "Shot in {location}: {subject} {action}. {adj} {theme}. xAmateur.",
    "Real {theme} action — {subject} {action} in {location}. Via xmateur.",
    "{subject} {action} in {location}. {adj} {theme}. Watch on x amateur.",
    "{adj} {theme} session — {subject} {action} in {location}. xAmateur.",
    "Full {theme} video: {subject} {action} from {location}. xmateur.",
    "Catch {subject} {action} in {location}. {adj} {theme} — x amateur.",
    "{adj} {theme} footage of {subject} {action} in {location}. xAmateur.",
]

TIER1_SUBJECT = [
    "an amateur couple", "a college girl", "a MILF",
    "a wife", "a blonde", "a brunette",
    "a fitness girl", "a beach babe", "a redhead",
    "a curvy girl", "a natural beauty", "a first-timer",
    "an adventurous couple", "a young model", "a tanned girl",
]
TIER1_LOCATION = [
    "a bedroom", "a basement", "a beach hotel",
    "a college dorm", "a suburban home", "a cabin",
    "an apartment", "a motel", "a backyard",
    "a living room", "a master bedroom", "a rental",
    "a studio", "a beach house",
]
TIER1_THEME = [
    "amateur", "homemade", "real amateur", "authentic",
    "genuine amateur", "raw", "uncensored",
]
TIER1_ADJ = [
    "steamy", "intense", "passionate", "wild",
    "hot", "sizzling", "erotic", "seductive",
]
TIER1_ACTION = [
    "exploring fantasies", "going all the way",
    "getting hot", "letting loose",
    "spicing things up", "making their own content",
    "sharing a moment", "living out desires",
    "getting naughty", "giving in to temptation",
    "enjoying private time",
]


# ─── Tier 3: Malay/Asian ──────────────────────────────────────────────────

TIER3_INTRO = [
    "{subject} {action} — {adj} betul. Koleksi xxMelayu.",
    "Layan {subject} {action} kat xxMelayu. {adj} gila.",
    "{adj} betul {subject} ni, {action}. xxMalay punya.",
    "Tengok {subject} {action}. {adj} sampai {reaction}. xMelayu.",
    "Cerita {subject} {action} dekat {location}. xxMelayu terkini.",
    "Jangan lupa subscribe xxMalay — {subject} {action}.",
    "{subject} tengah {action}. {adj} gila. xxMelayu original.",
    "Full video kat xMelayu: {subject} {action} dekat {location}.",
    "Percaya tak? {subject} {action} dekat {location}. Koleksi xxMalay.",
    "Baru update dekat xMelayu: {subject} {action}. {adj} gila.",
    "Ini antara video terbaik xxMelayu — {subject} {action}.",
    "Apa jadi dekat {location}? {subject} {action}. xxMalay site.",
    "Dari koleksi xxMelayu: {subject} {action}. {adj} gila.",
    "Korang kena tengok ni — {subject} {action} dekat {location}. xxMalay.",
    "Hanya di xMelayu: {subject} {action}. {adj} betul.",
]

TIER3_SUBJECT = [
    "awek tudung", "makcik", "janda", "bini orang",
    "ustazah", "awek cantik", "jiran", "pelajar",
    "budak kolej", "awek kilang", "cikgu", "nurse",
    "sales girl", "gadis", "awek kelantan",
]
TIER3_ACTION = [
    "main dengananton", "layan", "pancut",
    "gigit tetek", "bogel depan kamera",
    "baring sambil main", "buka kaki lebar",
    "masuk bilik", "kasi habuan",
]
TIER3_LOCATION = [
    "bilik sewa", "homestay", "hotel murah",
    "flat PPR", "parking lot", "toilet",
    "dalam kereta", "bilik air", "kampus",
    "kampung", "atas katil", "rumah kedai",
]
TIER3_ADJ = [
    "gatal", "geram", "seksi", "mantap", "power",
    "gempak", "gila babi", "meletup", "laju",
]
TIER3_REACTION = [
    "tak boleh tidur", "nak lagi", "meletup otak",
    "sakit pinggang", "terketar", "tegang",
    "mind blown", "go crazy",
]


def pick(lst):
    return random.choice(lst)


def match_kw(kws, pool):
    for kw in kws:
        kl = kw.lower()
        for p in pool:
            pl = p.lower()
            if kl in pl or pl in kl:
                return p
    return None


def make_tier1(kws):
    sub = match_kw(kws, TIER1_SUBJECT) or pick(TIER1_SUBJECT)
    loc = pick(TIER1_LOCATION)
    theme = match_kw(kws, TIER1_THEME) or pick(TIER1_THEME)
    adj = match_kw(kws, TIER1_ADJ) or pick(TIER1_ADJ)
    act = match_kw(kws, TIER1_ACTION) or pick(TIER1_ACTION)
    tpl = pick(TIER1_INTRO)
    desc = tpl.replace("{subject}", sub).replace("{location}", loc)
    desc = desc.replace("{theme}", theme).replace("{adj}", adj).replace("{action}", act)
    desc = re.sub(r'\s+', ' ', desc).strip()
    return desc[0].upper() + desc[1:] if desc else desc


def make_tier3(kws):
    sub = match_kw(kws, TIER3_SUBJECT) or pick(TIER3_SUBJECT)
    loc = pick(TIER3_LOCATION) if random.random() > 0.5 else ""
    act = match_kw(kws, TIER3_ACTION) or pick(TIER3_ACTION)
    adj = match_kw(kws, TIER3_ADJ) or pick(TIER3_ADJ)
    react = pick(TIER3_REACTION)
    tpl = pick(TIER3_INTRO)
    desc = tpl.replace("{subject}", sub).replace("{action}", act)
    desc = desc.replace("{location}", loc).replace("{adj}", adj).replace("{reaction}", react)
    desc = re.sub(r'\s+', ' ', desc).strip()
    desc = desc.replace("dekat .", "dekat bilik").replace("dekat,", "")
    return desc[0].upper() + desc[1:] if desc else desc


def pick_emoji(kws):
    txt = " ".join(k.lower() for k in kws)
    e = ""
    if any(w in txt for w in ["viral", "bocor", "leaked"]):
        e += "\U0001f525"
    if any(w in txt for w in ["tudung", "hijab"]):
        e += "\U0001f9d5"
    if any(w in txt for w in ["malay", "melayu"]):
        e += "\U0001f1f2\U0001f1fe"
    if any(w in txt for w in ["janda", "balu"]):
        e += "\U0001f494"
    if any(w in txt for w in ["couple"]):
        e += "\U0001f495"
    if any(w in txt for w in ["bdsm", "bondage"]):
        e += "\u26d3\ufe0f"
    if any(w in txt for w in ["outdoor", "public"]):
        e += "\U0001f333"
    return e


def generate(video):
    kws = video.get("keywords", []) or video.get("subTags", [])
    kws = clean_keywords(kws)
    title = video.get("title", "") or video.get("name", "")
    cat = video.get("category", "")

    # decide tier
    # Tier 1 = English amateur (xAmateur / x amateur / xmateur)
    # Tier 3 = Malay/Asian (xMelayu / xxMalay)
    tier1_cats = {"Reality", "Public", "Bondage", "Group", "Interracial", "Couple",
                  "Japanese", "MILF", "Uniform"}
    tier1_kws = {"amateur", "american", "usa", "uk", "europe", "western", "homemade"}
    tier3_cats = {"Malay Adult", "Hijab", "KL Series", "Selangor Series",
                  "Sabah Sarawak Series", "Kedah Series"}
    tier3_kws = {"tudung", "awek", "bini", "janda", "melayu", "ustazah",
                 "hijab", "bocor", "skandal", "pancut", "kulum", "melayu"}

    kwset = set(k.lower() for k in kws)
    has_t1_signal = cat in tier1_cats or bool(kwset & tier1_kws)
    has_t3_signal = cat in tier3_cats or bool(kwset & tier3_kws)
    # Default: non-Malay categories that don't hit Tier 3 → Tier 1
    is_tier1 = has_t1_signal and not has_t3_signal
    if not has_t1_signal and not has_t3_signal:
        # ambiguous — assign based on category
        is_tier1 = cat not in tier3_cats and "malay" not in cat.lower() and "hijab" not in cat.lower()

    if is_tier1:
        descs = [make_tier1(kws) for _ in range(2)]
        desc = min(descs, key=lambda d: sum(d.lower().count(w) for w in ["amateur", "homemade", "real", "hot"]))
    else:
        descs = [make_tier3(kws) for _ in range(2)]
        desc = max(descs, key=len)

    emoji = pick_emoji(kws)
    if emoji:
        desc += "\n\n" + emoji

    return desc, kws


def process_index(path, descs, args):
    if not os.path.exists(path):
        print(f"\u26a0\ufe0f  Index not found: {path}")
        return 0
    with open(path, "r", encoding="utf-8") as f:
        videos = json.load(f)
    print(f"\U0001f4f9 Found {len(videos)} videos in {os.path.basename(path)}")

    gen = 0
    skip = 0
    start = _time()
    max_gen = args.count

    for v in videos:
        if max_gen > 0 and gen >= max_gen:
            break
        vid = v["id"]
        if not args.force and vid in descs.get("descriptions", {}):
            skip += 1
            continue
        text, _ = generate(v)
        descs["descriptions"][vid] = {
            "text": text,
            "autoGenerated": True,
            "regenerated": args.force,
            "updatedAt": datetime.now().isoformat(),
        }
        gen += 1
        if gen % 500 == 0:
            print(f"\u2705 Generated {gen}...")

    elapsed = _time() - start
    print(f"   Gen: {gen}  Skip: {skip}  Time: {elapsed:.1f}s")
    return gen


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", "-f", action="store_true")
    parser.add_argument("--count", "-c", type=int, default=0)
    parser.add_argument("--english", "-e", action="store_true")
    args = parser.parse_args()

    if args.count == 0:
        print("\U0001f680 Generating ALL videos (no limit)")
    else:
        print(f"\U0001f680 Generating up to {args.count}")

    descs = {"descriptions": {}}
    if os.path.exists(DESCRIPTIONS_FILE) and not args.force:
        with open(DESCRIPTIONS_FILE, "r", encoding="utf-8") as f:
            descs = json.load(f)
        n = len(descs.get("descriptions", {}))
        print(f"\U0001f4c4 Found {n} existing")
    else:
        print("\U0001f4c4 Starting fresh")

    total = process_index(VIDEO_INDEX_FILE, descs, args)
    if args.english:
        total += process_index(EN_INDEX_FILE, descs, args)

    with open(DESCRIPTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(descs, f, indent=2, ensure_ascii=False)

    print(f"\n\u2705 Done! Total: {len(descs['descriptions'])}")


if __name__ == "__main__":
    main()
