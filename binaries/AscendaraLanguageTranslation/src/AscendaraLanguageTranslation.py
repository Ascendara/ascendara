"""Translate Ascendara JSON using Bing, with Google fallback.

The provider flow follows the locally installed jsontt workflow, while keeping
the shipped helper independent of Node/npm. Failed runs never replace a language.
"""
import argparse
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import errno
import json
import logging
import os
from pathlib import Path
import re
import sys
import tempfile
from threading import Lock
import time

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
LANGUAGE_CODE = re.compile(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*")
PROTECTED = re.compile(r"\{\{[^{}]*\}\}|\{[^{}\n]*\}|(?:https?://|www\.)[^\s<>]+|</?[^>]+>|\$t\([^)]*\)")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36"}


def atomic_json(path, data, replace_attempts=8):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=path.name + ".", suffix=".tmp", delete=False) as handle:
            temporary = handle.name
            json.dump(data, handle, ensure_ascii=False, indent=2)
        for attempt in range(replace_attempts):
            try:
                os.replace(temporary, path)
                break
            except OSError as error:
                # Windows readers, indexers, and antivirus can briefly hold a
                # handle without FILE_SHARE_DELETE. Never remove the old file.
                locked = (error.errno in (errno.EACCES, errno.EPERM)
                          or getattr(error, "winerror", None) in (5, 32, 33))
                if not locked or attempt == replace_attempts - 1:
                    raise
                time.sleep(min(0.025 * (2 ** attempt), 0.25))
    finally:
        if temporary and os.path.exists(temporary):
            try:
                os.unlink(temporary)
            except OSError:
                logging.warning("Could not remove temporary translation file: %s", temporary)


def language_directory():
    if sys.platform == "win32":
        return Path(os.environ["LOCALAPPDATA"]) / "Ascendara" / "languages"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/ascendara/languages"
    return Path.home() / ".ascendara/languages"


class RateLimiter:
    def __init__(self, limit=8):
        self.limit = limit
        self.requests = deque()
        self.lock = Lock()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            while self.requests and now - self.requests[0] >= 1:
                self.requests.popleft()
            if len(self.requests) >= self.limit:
                time.sleep(max(0, 1 - (now - self.requests.popleft())))
            self.requests.append(time.monotonic())


class TranslationProgress:
    def __init__(self, language_code, path=None):
        self.path = path or Path.home() / "translation_progress.ascendara.json"
        self.language_code = language_code
        self.total = 0
        self.done = 0
        self.last_phase = None
        self.last_write = 0
        self.write_failed = False
        self.set_phase("initializing")

    def set_phase(self, phase, error=None):
        now = time.monotonic()
        if (phase == self.last_phase == "translating" and self.done < self.total
                and now - self.last_write < 0.25):
            return
        data = {"languageCode": self.language_code, "phase": phase,
                "progress": 1 if phase == "completed" else self.done / max(1, self.total),
                "completedStrings": self.done, "totalStrings": self.total,
                "timestamp": int(time.time() * 1000)}
        if error:
            data["error"] = error
        # Progress is best-effort metadata; a locked progress file must never
        # abort translation or turn a successfully saved language into a failure.
        try:
            atomic_json(self.path, data, replace_attempts=3)
            self.write_failed = False
        except OSError as write_error:
            if not self.write_failed:
                logging.warning("Could not update translation progress; will retry: %s", write_error)
            self.write_failed = True
        finally:
            self.last_phase = phase
            self.last_write = now


class Translator:
    def __init__(self):
        self.limiter = RateLimiter()
        self.bing_lock = Lock()
        self.bing_config = None
        self.bing_retry_at = 0

    def bing(self, text, language):
        # One bootstrap per token lifetime, even when ten workers start together.
        with self.bing_lock:
            if time.monotonic() < self.bing_retry_at:
                raise ValueError("Bing temporarily unavailable")
            if not self.bing_config or time.monotonic() >= self.bing_config["expires"]:
                try:
                    self.limiter.wait()
                    response = requests.get("https://www.bing.com/translator", headers=HEADERS, timeout=20)
                    response.raise_for_status()
                    page = response.text
                    token_match = re.search(r"params_AbusePreventionHelper\s*=\s*(\[[^\]]+\])", page)
                    ig = re.search(r'IG:"([^"]+)"', page)
                    iid = re.search(r'data-iid="([^"]+)"', page)
                    if not token_match or not ig or not iid:
                        raise ValueError("Bing did not provide translation credentials")
                    key, token, lifetime = json.loads(token_match.group(1))
                    self.bing_config = {"key": key, "token": token, "IG": ig.group(1),
                                        "IID": iid.group(1), "cookies": response.cookies.get_dict(),
                                        "expires": time.monotonic() + float(lifetime) / 1000}
                except Exception:
                    self.bing_retry_at = time.monotonic() + 60
                    raise
            config = self.bing_config.copy()
        aliases = {"zh-CN": "zh-Hans", "zh-TW": "zh-Hant", "iw": "he", "tl": "fil", "jw": "jv"}
        self.limiter.wait()
        response = requests.post("https://www.bing.com/ttranslatev3",
                                 params={"isVertical": "1", "IG": config["IG"], "IID": config["IID"]},
                                 data={"fromLang": "en", "to": aliases.get(language, language), "text": text,
                                       "key": config["key"], "token": config["token"]},
                                 cookies=config["cookies"], headers=HEADERS, timeout=20)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not data:
            with self.bing_lock:
                self.bing_config = None
                self.bing_retry_at = time.monotonic() + 60
            raise ValueError("Bing rejected the translation request")
        return data[0]["translations"][0]["text"]

    def google(self, text, language):
        aliases = {"zh-Hans": "zh-CN", "zh-Hant": "zh-TW", "iw": "he", "jv": "jw", "fil": "tl"}
        self.limiter.wait()
        response = requests.post("https://translate.google.com/translate_a/single",
                                 params={"client": "at", "dt": ["t", "rm"], "dj": "1"},
                                 data={"sl": "en", "tl": aliases.get(language, language), "q": text},
                                 headers=HEADERS, timeout=20)
        response.raise_for_status()
        data = response.json()
        return "".join(part["trans"] for part in data["sentences"] if isinstance(part.get("trans"), str))

    def translate(self, text, language):
        protected = []

        def protect(match):
            protected.append(match.group())
            return "{" + str(len(protected) - 1) + "}"

        masked = PROTECTED.sub(protect, text)
        if language == "en" or not any(c.isalpha() for c in re.sub(r"\{\d+\}", "", masked)):
            return text
        # Avoid silent truncation at the provider's 5,000-character limit.
        if len(masked.encode("utf-16-le")) // 2 > 4500:
            parts = re.split(r"(\s+)", text)
            chunks, chunk = [], ""
            for part in parts:
                if len((chunk + part).encode("utf-16-le")) // 2 > 4000:
                    if not chunk or len(part.encode("utf-16-le")) // 2 > 4000:
                        raise ValueError("Translation contains an oversized unbroken string")
                    chunks.append(chunk)
                    chunk = ""
                chunk += part
            chunks.append(chunk)
            return "".join(self.translate(part, language) for part in chunks)
        last_error = None
        for attempt in range(3):
            for provider in (self.bing, self.google):
                try:
                    translated = provider(masked, language)
                    if not isinstance(translated, str) or not translated.strip():
                        raise ValueError("Provider returned an empty translation")
                    expected = Counter("{" + str(i) + "}" for i in range(len(protected)))
                    if Counter(re.findall(r"\{\d+\}", translated)) != expected:
                        raise ValueError("Provider changed translation placeholders")
                    translated = re.sub(r"\{(\d+)\}", lambda m: protected[int(m.group(1))], translated)
                    # Providers trim text; retain the source's boundary whitespace.
                    leading = text[:len(text) - len(text.lstrip())]
                    trailing = text[len(text.rstrip()):]
                    return leading + translated.strip() + trailing
                except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as error:
                    last_error = error
            if attempt < 2:
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Translation failed for {language}: {last_error}")


def leaves(value, path=()):
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, path + (key,))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from leaves(child, path + (index,))
    else:
        yield path, value


def merge_missing(source, existing):
    """Retain valid translations, filling absent/failed leaves from the source."""
    if isinstance(source, dict):
        result = copy.deepcopy(existing) if isinstance(existing, dict) else {}
        for key, value in source.items():
            result[key] = merge_missing(value, result.get(key))
        return result
    if isinstance(source, list):
        old = existing if isinstance(existing, list) else []
        return [merge_missing(value, old[i] if i < len(old) else None) for i, value in enumerate(source)]
    if isinstance(source, str):
        return existing if valid_translation(existing, source) else source
    return source


def valid_translation(value, source):
    return (isinstance(value, str) and (value != "--" or source == "--") and (bool(value.strip()) or not source.strip())
            and Counter(PROTECTED.findall(value)) == Counter(PROTECTED.findall(source)))


def at_path(value, path):
    try:
        for key in path:
            value = value[key]
        return value
    except (KeyError, IndexError, TypeError):
        return None


def translate_document(source, language, progress, existing=None, keys=None, workers=10, translator=None):
    result = merge_missing(source, existing) if existing is not None else copy.deepcopy(source)
    jobs = {}
    for path, value in leaves(source):
        if not isinstance(value, str):
            continue
        dotted = ".".join(map(str, path))
        if keys and not any(dotted == key or dotted.startswith(key + ".") for key in keys):
            continue
        if existing is not None and valid_translation(at_path(existing, path), value):
            continue
        jobs.setdefault(value, []).append(path)
    # For explicit updates, do not fill unrequested leaves with untranslated English.
    if existing is not None and keys:
        result = copy.deepcopy(existing)
        for key in keys:
            parts = tuple(key.split("."))
            reference = at_path(source, parts)
            if reference is None:
                raise ValueError(f"Unknown reference key: {key}")
            parent = result
            for part in parts[:-1]:
                if not isinstance(parent.get(part), dict):
                    parent[part] = {}
                parent = parent[part]
            parent[parts[-1]] = merge_missing(reference, at_path(existing, parts))
    progress.total = sum(map(len, jobs.values()))
    progress.set_phase("translating")
    translator = translator or Translator()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(translator.translate, text, language): paths for text, paths in jobs.items()}
        try:
            for future in as_completed(futures):
                translated = future.result()
                source_text = at_path(source, futures[future][0])
                if not valid_translation(translated, source_text):
                    raise ValueError("Translation changed protected values or returned an invalid string")
                for path in futures[future]:
                    parent = result
                    for key in path[:-1]:
                        parent = parent[key]
                    parent[path[-1]] = translated
                    progress.done += 1
                progress.set_phase("translating")
        except BaseException:
            for future in futures:
                future.cancel()
            raise
    return result


def get_english_translations():
    response = requests.get("https://api.ascendara.app/language/en", headers=HEADERS, timeout=30)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict) or not data:
        raise ValueError("English reference must be a nonempty JSON object")
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lang", help="Target language code supported by Bing or Google")
    parser.add_argument("--output", "-o", help="Language JSON destination")
    parser.add_argument("--source", help="Local English JSON reference (otherwise fetched from Ascendara)")
    parser.add_argument("--progress", help="Progress JSON destination")
    parser.add_argument("--updateKeys", action="store_true", help="Preserve existing translations and fill missing keys")
    parser.add_argument("--newKey", action="append", default=[], help="Limit updates to this dotted key/subtree")
    parser.add_argument("--concurrencylimit", type=int, default=10)
    args = parser.parse_args(argv)
    if not LANGUAGE_CODE.fullmatch(args.lang):
        parser.error("Invalid language code")
    if not 1 <= args.concurrencylimit <= 32:
        parser.error("Concurrency must be between 1 and 32")
    if args.newKey and not args.updateKeys:
        parser.error("--newKey requires --updateKeys")
    progress = None
    try:
        progress = TranslationProgress(args.lang, args.progress)
        output = Path(args.output) if args.output else language_directory() / f"{args.lang}.json"
        progress.set_phase("fetching")
        source = json.loads(Path(args.source).read_text(encoding="utf-8-sig")) if args.source else get_english_translations()
        if not isinstance(source, dict) or not source:
            raise ValueError("English reference must be a nonempty JSON object")
        existing = None
        if args.updateKeys:
            existing = json.loads(output.read_text(encoding="utf-8-sig")) if output.exists() else {}
            if not isinstance(existing, dict):
                raise ValueError("Existing translation must be a JSON object")
        translated = translate_document(source, args.lang, progress, existing, args.newKey, args.concurrencylimit)
        progress.set_phase("saving")
        atomic_json(output, translated)
        # The app updates the shared version only after ALL installed languages succeed.
        progress.set_phase("completed")
        return 0
    except (Exception, KeyboardInterrupt) as error:
        phase = "cancelled" if isinstance(error, KeyboardInterrupt) else "error"
        logging.error("Translation %s: %s", phase, error)
        if progress:
            progress.set_phase(phase, str(error) or "Translation cancelled")
        return 1


if __name__ == "__main__":
    sys.exit(main())
