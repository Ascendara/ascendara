# ==============================================================================
# Ascendara Notification Helper
# ==============================================================================
# A command-line tool for handling Ascendara notifications
# Read more about the Notification Helper Tool here:
# https://ascendara.app/docs/binary-tool/notification-helper

import sys
import os
import json
import atexit
import logging
import argparse
import subprocess
import tempfile
import traceback
import urllib.request
from PyQt6.QtCore import (
    Qt, QTimer, QEasingCurve, QPropertyAnimation, QPoint, QRectF, QLockFile,
    QElapsedTimer,
)
from PyQt6.QtGui import (
    QColor, QPainter, QPainterPath, QPixmap, QFont, QFontMetrics, QPen,
    QTextLayout, QGuiApplication, QCursor,
)
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QVBoxLayout, QHBoxLayout, QSizePolicy,
)


def get_ascendara_log_path():
    if sys.platform == "win32":
        appdata = os.getenv("APPDATA")
    else:
        appdata = os.path.expanduser("~/.config")
    ascendara_dir = os.path.join(appdata, "Ascendara by tagoWorks")
    os.makedirs(ascendara_dir, exist_ok=True)
    return os.path.join(ascendara_dir, "notificationhelper.log")

LOG_PATH = get_ascendara_log_path()

# Remove all handlers associated with the root logger object (for reloads)
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8", mode="a"),
        logging.StreamHandler(sys.stdout)
    ]
)
logging.info(f"[AscendaraNotificationHelper] Logging to {LOG_PATH}")

logger = logging.getLogger(__name__)

def log_uncaught_exceptions(exctype, value, tb):
    logger.critical("Uncaught exception:", exc_info=(exctype, value, tb))

sys.excepthook = log_uncaught_exceptions


# ------------------------------------------------------------------------------
# Theme palettes
# ------------------------------------------------------------------------------
# Mirrors the app's tailwind theme tokens (tailwind.config.js) so a notification
# looks like it belongs to the theme the user picked. Values are "r g b" strings,
# the same format custom themes are stored in.
STATUS_DEFAULTS = {
    "success": "34 197 94",
    "warning": "234 179 8",
    "error": "239 68 68",
    "info": "59 130 246",
    "achievement": "250 204 21",
}

THEMES = {
    "light":     {"bg": "255 255 255", "fg": "15 23 42",    "muted": "100 116 139", "accent": "59 130 246",  "border": "226 232 240"},
    "blue":      {"bg": "255 255 255", "fg": "30 58 138",   "muted": "71 85 105",   "accent": "37 99 235",   "border": "191 219 254"},
    "purple":    {"bg": "255 255 255", "fg": "59 7 100",    "muted": "107 33 168",  "accent": "124 58 237",  "border": "221 214 254"},
    "emerald":   {"bg": "255 255 255", "fg": "6 78 59",     "muted": "4 120 87",    "accent": "16 185 129",  "border": "167 243 208"},
    "rose":      {"bg": "255 255 255", "fg": "136 19 55",   "muted": "190 18 60",   "accent": "225 29 72",   "border": "254 205 211"},
    "amber":     {"bg": "255 251 235", "fg": "120 53 15",   "muted": "146 64 14",   "accent": "217 119 6",   "border": "253 230 138"},
    "dark":      {"bg": "30 41 59",    "fg": "241 245 249", "muted": "148 163 184", "accent": "59 130 246",  "border": "51 65 85"},
    "midnight":  {"bg": "15 23 42",    "fg": "199 210 254", "muted": "165 180 252", "accent": "129 140 248", "border": "51 65 85"},
    "cyberpunk": {"bg": "31 41 55",    "fg": "251 207 232", "muted": "249 168 212", "accent": "236 72 153",  "border": "55 65 81"},
    "sunset":    {"bg": "51 65 85",    "fg": "254 215 170", "muted": "253 186 116", "accent": "249 115 22",  "border": "71 85 105"},
    "forest":    {"bg": "30 41 35",    "fg": "187 247 208", "muted": "74 222 128",  "accent": "34 197 94",   "border": "40 51 45"},
    "ocean":     {"bg": "30 41 59",    "fg": "207 250 254", "muted": "103 232 249", "accent": "34 211 238",  "border": "51 65 85"},
}

# Custom theme keys the theme maker writes, with the general theme keys each one
# falls back to so older custom themes still get a sensible notification
CUSTOM_KEYS = {
    "bg": ("notificationBackground", "card", "background"),
    "fg": ("notificationForeground", "cardForeground", "foreground"),
    "muted": ("notificationMuted", "mutedForeground"),
    "accent": ("notificationAccent", "primary"),
    "border": ("notificationBorder", "border"),
    "achievement": ("notificationAchievement", "starFilled"),
    "success": ("success",),
    "warning": ("warning",),
    "error": ("error",),
    "info": ("info",),
}

FONT_FAMILIES = ["Segoe UI Variable Text", "Segoe UI", "Inter", "Noto Sans", "Ubuntu", "Helvetica Neue", "Arial"]


def parse_rgb(value):
    """Parse "r g b", "r,g,b" or "#rrggbb" into a QColor, or None"""
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    if value.startswith("#"):
        color = QColor(value)
        return color if color.isValid() else None
    try:
        parts = [int(float(p)) for p in value.replace(",", " ").split()]
    except ValueError:
        return None
    if len(parts) != 3 or any(p < 0 or p > 255 for p in parts):
        return None
    return QColor(*parts)


def find_settings_path():
    if sys.platform == "win32":
        base = os.getenv("APPDATA") or ""
        folders = ["Ascendara", "ascendara", "Electron"]
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support")
        folders = ["ascendara", "Ascendara", "Electron"]
    else:
        base = os.path.expanduser("~/.config")
        folders = ["ascendara", "Ascendara", "Electron"]
    for folder in folders:
        candidate = os.path.join(base, folder, "ascendarasettings.json")
        if os.path.exists(candidate):
            return candidate
    return None


def load_custom_theme():
    path = find_settings_path()
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            settings = json.load(f)
        custom = settings.get("customTheme")
        if isinstance(custom, list) and custom and isinstance(custom[0], dict):
            return custom[0]
    except Exception as e:
        logger.warning(f"Failed to read custom theme from {path}: {e}")
    return None


def is_dark(color):
    return 0.2126 * color.red() + 0.7152 * color.green() + 0.0722 * color.blue() < 128


def resolve_palette(theme, colors_override=None):
    """Build the notification palette for a theme name, reading the custom theme
    from settings when needed. colors_override (a custom theme dict) wins."""
    custom = colors_override
    if custom is None and (theme == "custom" or theme not in THEMES):
        custom = load_custom_theme()

    base = dict(THEMES.get(theme) or THEMES["dark"])
    base.update({k: v for k, v in STATUS_DEFAULTS.items() if k not in base})

    palette = {}
    for key, fallback in base.items():
        color = None
        if custom:
            for custom_key in CUSTOM_KEYS.get(key, ()):
                color = parse_rgb(custom.get(custom_key))
                if color:
                    break
        palette[key] = color or parse_rgb(fallback)
        palette.setdefault("_defaulted", set())
        if not color:
            palette["_defaulted"].add(key)

    palette["dark"] = is_dark(palette["bg"])
    # Bright yellow washes out on light cards, so deepen it unless the user chose it
    if not palette["dark"]:
        for key, deeper in (("achievement", "202 138 4"), ("warning", "202 138 4")):
            if key in palette["_defaulted"]:
                palette[key] = parse_rgb(deeper)
    del palette["_defaulted"]
    return palette


def infer_type(title):
    title = (title or "").lower()
    if "fail" in title or "error" in title:
        return "error"
    if "warn" in title:
        return "warning"
    if any(word in title for word in ("complete", "success", "installed", "finished", "ready")):
        return "success"
    return "info"


def rgba(color, alpha):
    return f"rgba({color.red()}, {color.green()}, {color.blue()}, {alpha})"


def make_font(px, weight=QFont.Weight.Normal, letter_spacing=0.0):
    font = QFont()
    font.setFamilies(FONT_FAMILIES)
    font.setPixelSize(px)
    font.setWeight(weight)
    font.setHintingPreference(QFont.HintingPreference.PreferNoHinting)
    if letter_spacing:
        font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, letter_spacing)
    return font


def elide_lines(text, font, width, max_lines):
    """Wrap text to width and elide the last visible line"""
    text = " ".join((text or "").split())
    if not text:
        return ""
    metrics = QFontMetrics(font)
    layout = QTextLayout(text, font)
    layout.beginLayout()
    lines = []
    while True:
        line = layout.createLine()
        if not line.isValid():
            break
        line.setLineWidth(width)
        lines.append((line.textStart(), line.textLength()))
    layout.endLayout()
    if len(lines) <= max_lines:
        return "\n".join(text[s:s + n].strip() for s, n in lines)
    visible = [text[s:s + n].strip() for s, n in lines[:max_lines - 1]]
    start = lines[max_lines - 1][0]
    visible.append(metrics.elidedText(text[start:], Qt.TextElideMode.ElideRight, width))
    return "\n".join(visible)


# ------------------------------------------------------------------------------
# Crash reporter
# ------------------------------------------------------------------------------

def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join(os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.abspath(os.path.join(os.path.dirname(__file__), '../../AscendaraCrashReporter/target/release')), binary_name)
        if os.path.exists(crash_reporter_path):
            kwargs = {"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}
            subprocess.Popen(
                [crash_reporter_path, "notificationhelper", str(error_code), error_message],
                **kwargs
            )
        else:
            logging.error(f"Crash reporter not found at: {crash_reporter_path}")
    except Exception as e:
        logging.error(f"Failed to launch crash reporter: {e}")

def launch_crash_reporter(error_code, error_message):
    """Register the crash reporter to launch on exit with the given error details"""
    if not hasattr(launch_crash_reporter, "_registered"):
        atexit.register(_launch_crash_reporter_on_exit, error_code, error_message)
        launch_crash_reporter._registered = True


# ------------------------------------------------------------------------------
# Stacking
# ------------------------------------------------------------------------------
# Every notification is its own process, so they coordinate through lock files
# to stack instead of drawing on top of each other.
SLOT_DIR = os.path.join(tempfile.gettempdir(), "ascendara-notifications")
MAX_SLOTS = 5


class StackSlot:
    def __init__(self):
        self.index = 0
        self.lock = None
        os.makedirs(SLOT_DIR, exist_ok=True)
        for i in range(MAX_SLOTS):
            lock = QLockFile(os.path.join(SLOT_DIR, f"slot-{i}.lock"))
            lock.setStaleLockTime(30000)
            if lock.tryLock(0):
                self.index, self.lock = i, lock
                return
        # Every slot is taken, so reuse the top one rather than not showing at all
        self.index = MAX_SLOTS - 1

    def offset_below(self, gap):
        """Total height of the notifications stacked under this one"""
        total = 0
        for i in range(self.index):
            try:
                with open(os.path.join(SLOT_DIR, f"slot-{i}.height"), "r") as f:
                    total += int(f.read().strip()) + gap
            except (OSError, ValueError):
                total += 110 + gap
        return total

    def publish_height(self, height):
        if self.lock is None:
            return
        try:
            with open(os.path.join(SLOT_DIR, f"slot-{self.index}.height"), "w") as f:
                f.write(str(height))
        except OSError:
            pass

    def release(self):
        if self.lock is not None:
            self.lock.unlock()
            self.lock = None


# ------------------------------------------------------------------------------
# Widgets
# ------------------------------------------------------------------------------

class StatusIcon(QWidget):
    """Tinted badge with a vector glyph for the notification type"""

    def __init__(self, kind, palette, size=40, parent=None):
        super().__init__(parent)
        self.kind = kind
        self.palette_ = palette
        self.setFixedSize(size, size)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        color = self.palette_[self.kind] if self.kind != "info" else self.palette_["accent"]
        rect = QRectF(self.rect())

        tint = QColor(color)
        tint.setAlpha(46 if self.palette_["dark"] else 30)
        badge = QPainterPath()
        badge.addRoundedRect(rect, 11, 11)
        p.fillPath(badge, tint)

        pen = QPen(color, 2.2, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        c = rect.center()
        r = rect.width() * 0.24
        if self.kind == "success":
            path = QPainterPath()
            path.moveTo(c.x() - r * 0.95, c.y() + r * 0.05)
            path.lineTo(c.x() - r * 0.25, c.y() + r * 0.75)
            path.lineTo(c.x() + r * 1.0, c.y() - r * 0.7)
            p.drawPath(path)
        elif self.kind == "error":
            p.drawLine(QPoint(int(c.x() - r * 0.7), int(c.y() - r * 0.7)), QPoint(int(c.x() + r * 0.7), int(c.y() + r * 0.7)))
            p.drawLine(QPoint(int(c.x() + r * 0.7), int(c.y() - r * 0.7)), QPoint(int(c.x() - r * 0.7), int(c.y() + r * 0.7)))
        elif self.kind == "warning":
            p.drawLine(QPoint(int(c.x()), int(c.y() - r * 0.95)), QPoint(int(c.x()), int(c.y() + r * 0.25)))
            p.setBrush(color)
            p.setPen(Qt.PenStyle.NoPen)
            p.drawEllipse(c + QPoint(0, int(r * 0.85)), 1.6, 1.6)
        else:
            # Download arrow for general Ascendara activity
            p.drawLine(QPoint(int(c.x()), int(c.y() - r * 1.0)), QPoint(int(c.x()), int(c.y() + r * 0.45)))
            path = QPainterPath()
            path.moveTo(c.x() - r * 0.6, c.y() - r * 0.1)
            path.lineTo(c.x(), c.y() + r * 0.5)
            path.lineTo(c.x() + r * 0.6, c.y() - r * 0.1)
            p.drawPath(path)
            p.drawLine(QPoint(int(c.x() - r * 0.9), int(c.y() + r * 1.0)), QPoint(int(c.x() + r * 0.9), int(c.y() + r * 1.0)))


class AchievementIcon(QWidget):
    """Rounded achievement artwork with an accent ring, or a drawn trophy"""

    def __init__(self, pixmap, palette, size=60, parent=None):
        super().__init__(parent)
        self.pixmap = pixmap
        self.palette_ = palette
        self.setFixedSize(size, size)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        gold = self.palette_["achievement"]
        rect = QRectF(self.rect()).adjusted(1.5, 1.5, -1.5, -1.5)
        clip = QPainterPath()
        clip.addRoundedRect(rect, 12, 12)

        if self.pixmap and not self.pixmap.isNull():
            p.save()
            p.setClipPath(clip)
            scaled = self.pixmap.scaled(
                rect.size().toSize(),
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation,
            )
            x = rect.x() + (rect.width() - scaled.width()) / 2
            y = rect.y() + (rect.height() - scaled.height()) / 2
            p.drawPixmap(int(x), int(y), scaled)
            p.restore()
        else:
            tint = QColor(gold)
            tint.setAlpha(46 if self.palette_["dark"] else 36)
            p.fillPath(clip, tint)
            self._draw_trophy(p, rect, gold)

        ring = QColor(gold)
        ring.setAlpha(200)
        p.setPen(QPen(ring, 2))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawPath(clip)

    @staticmethod
    def _draw_trophy(p, rect, color):
        c = rect.center()
        s = rect.width() / 60.0
        p.setPen(QPen(color, 2.4 * s, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin))
        p.setBrush(Qt.BrushStyle.NoBrush)
        # Handles
        p.drawArc(QRectF(c.x() - 17 * s, c.y() - 13 * s, 12 * s, 12 * s), 90 * 16, 180 * 16)
        p.drawArc(QRectF(c.x() + 5 * s, c.y() - 13 * s, 12 * s, 12 * s), 270 * 16, 180 * 16)
        # Cup
        cup = QPainterPath()
        cup.moveTo(c.x() - 11 * s, c.y() - 14 * s)
        cup.lineTo(c.x() + 11 * s, c.y() - 14 * s)
        cup.lineTo(c.x() + 11 * s, c.y() - 4 * s)
        cup.cubicTo(c.x() + 11 * s, c.y() + 4 * s, c.x() - 11 * s, c.y() + 4 * s, c.x() - 11 * s, c.y() - 4 * s)
        cup.closeSubpath()
        fill = QColor(color)
        fill.setAlpha(70)
        p.setBrush(fill)
        p.drawPath(cup)
        p.setBrush(Qt.BrushStyle.NoBrush)
        # Stem and base
        p.drawLine(QPoint(int(c.x()), int(c.y() + 3 * s)), QPoint(int(c.x()), int(c.y() + 10 * s)))
        p.drawLine(QPoint(int(c.x() - 8 * s), int(c.y() + 14 * s)), QPoint(int(c.x() + 8 * s), int(c.y() + 14 * s)))
        p.drawLine(QPoint(int(c.x() - 5 * s), int(c.y() + 10 * s)), QPoint(int(c.x() + 5 * s), int(c.y() + 10 * s)))


class CloseButton(QWidget):
    def __init__(self, palette, on_click, parent=None):
        super().__init__(parent)
        self.palette_ = palette
        self.on_click = on_click
        self.hovered = False
        self.setFixedSize(24, 24)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip("Dismiss")

    def enterEvent(self, event):
        self.hovered = True
        self.update()

    def leaveEvent(self, event):
        self.hovered = False
        self.update()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.rect().contains(event.position().toPoint()):
            self.on_click()
        event.accept()

    def mousePressEvent(self, event):
        event.accept()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        fg = self.palette_["fg"]
        if self.hovered:
            hover = QColor(fg)
            hover.setAlpha(28)
            path = QPainterPath()
            path.addRoundedRect(QRectF(self.rect()), 7, 7)
            p.fillPath(path, hover)
        glyph = QColor(self.palette_["fg"] if self.hovered else self.palette_["muted"])
        if not self.hovered:
            glyph.setAlpha(190)
        p.setPen(QPen(glyph, 1.6, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        c = QRectF(self.rect()).center()
        d = 4.0
        p.drawLine(QPoint(int(c.x() - d), int(c.y() - d)), QPoint(int(c.x() + d), int(c.y() + d)))
        p.drawLine(QPoint(int(c.x() + d), int(c.y() - d)), QPoint(int(c.x() - d), int(c.y() + d)))


def load_pixmap(source):
    if not source:
        return None
    pixmap = QPixmap()
    try:
        if source.startswith(("http://", "https://")):
            request = urllib.request.Request(source, headers={"User-Agent": "Ascendara"})
            with urllib.request.urlopen(request, timeout=3) as response:
                pixmap.loadFromData(response.read())
        else:
            pixmap.load(source)
    except Exception as e:
        logger.warning(f"Failed to load icon {source}: {e}")
        return None
    return None if pixmap.isNull() else pixmap


def resource_path(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


# ------------------------------------------------------------------------------
# Notification window
# ------------------------------------------------------------------------------

class NotificationWindow(QWidget):
    CARD_WIDTH = 360
    SHADOW = 18       # transparent margin the soft shadow is painted into
    RADIUS = 14
    SCREEN_MARGIN = 12
    STACK_GAP = 10

    def __init__(self, palette, title, message, kind="info", is_achievement=False,
                 icon=None, game=None, achievement=None, description=None, duration=None):
        super().__init__()
        self.palette_ = palette
        self.kind = kind
        self.is_achievement = is_achievement
        self.duration = duration or (7000 if is_achievement else 6000)
        self.remaining = self.duration
        self.closing = False
        self._progress = 1.0

        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.WindowDoesNotAcceptFocus
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedWidth(self.CARD_WIDTH + self.SHADOW * 2)

        if is_achievement:
            self._build_achievement(icon, game, achievement, description)
        else:
            self._build_standard(title, message)

        self.adjustSize()
        self.setFixedHeight(self.sizeHint().height())

        self.slot = StackSlot()
        self.slot.publish_height(self.height() - self.SHADOW * 2)

        self.clock = QElapsedTimer()
        self.tick = QTimer(self)
        self.tick.setInterval(16)
        self.tick.timeout.connect(self._on_tick)

    # -- layout -----------------------------------------------------------------

    def _root_layout(self):
        layout = QHBoxLayout(self)
        m = self.SHADOW
        # Extra bottom padding leaves room for the countdown bar
        layout.setContentsMargins(m + 14, m + 14, m + 10, m + 16)
        layout.setSpacing(12)
        return layout

    def _label(self, text, font, color, alpha=1.0):
        label = QLabel(text)
        label.setFont(font)
        label.setStyleSheet(f"color: {rgba(color, alpha)}; background: transparent;")
        label.setTextFormat(Qt.TextFormat.PlainText)
        label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        return label

    def _header(self, text, color, letter_spacing=0.6):
        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(6)
        app_icon = load_pixmap(resource_path("ascendara.ico"))
        if app_icon and not self.is_achievement:
            icon_label = QLabel()
            icon_label.setPixmap(app_icon.scaled(14, 14, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
            icon_label.setStyleSheet("background: transparent;")
            row.addWidget(icon_label)
        header = self._label(text.upper(), make_font(10, QFont.Weight.DemiBold, letter_spacing), color)
        row.addWidget(header, 1)
        row.addWidget(CloseButton(self.palette_, self.close_notification), 0, Qt.AlignmentFlag.AlignTop)
        return row

    def _text_width(self, icon_size):
        # card width minus paddings, icon, spacing
        return self.CARD_WIDTH - 14 - 10 - icon_size - 12

    def _build_standard(self, title, message):
        p = self.palette_
        layout = self._root_layout()
        layout.addWidget(StatusIcon(self.kind, p, 40), 0, Qt.AlignmentFlag.AlignTop)

        text_width = self._text_width(40)
        col = QVBoxLayout()
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(3)
        col.addLayout(self._header("Ascendara", p["accent"]))

        title_font = make_font(14, QFont.Weight.DemiBold)
        title_label = self._label(
            QFontMetrics(title_font).elidedText(title or "", Qt.TextElideMode.ElideRight, text_width - 4),
            title_font, p["fg"],
        )
        col.addWidget(title_label)

        if message:
            message_font = make_font(13)
            message_label = self._label(elide_lines(message, message_font, text_width - 4, 3), message_font, p["muted"])
            col.addWidget(message_label)

        layout.addLayout(col, 1)

    def _build_achievement(self, icon, game, achievement, description):
        p = self.palette_
        layout = self._root_layout()
        layout.addWidget(AchievementIcon(load_pixmap(icon), p, 60), 0, Qt.AlignmentFlag.AlignTop)

        text_width = self._text_width(60)
        col = QVBoxLayout()
        col.setContentsMargins(0, 0, 0, 0)
        col.setSpacing(2)
        col.addLayout(self._header("★  Achievement unlocked", p["achievement"], 0.8))

        name_font = make_font(15, QFont.Weight.DemiBold)
        name = achievement or "New achievement"
        col.addWidget(self._label(
            QFontMetrics(name_font).elidedText(name, Qt.TextElideMode.ElideRight, text_width - 4),
            name_font, p["fg"],
        ))

        if description:
            desc_font = make_font(12)
            col.addWidget(self._label(elide_lines(description, desc_font, text_width - 4, 2), desc_font, p["muted"]))

        if game:
            game_font = make_font(11, QFont.Weight.Medium)
            col.addSpacing(2)
            col.addWidget(self._label(
                QFontMetrics(game_font).elidedText(game, Qt.TextElideMode.ElideRight, text_width - 4),
                game_font, p["muted"], 0.8,
            ))

        layout.addLayout(col, 1)

    # -- painting ---------------------------------------------------------------

    def card_rect(self):
        m = self.SHADOW
        return QRectF(m, m, self.width() - m * 2, self.height() - m * 2)

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        pal = self.palette_
        card = self.card_rect()

        # Soft layered shadow, offset slightly downward
        shadow_strength = 0.55 if pal["dark"] else 0.22
        steps = 12
        for i in range(steps):
            t = i / steps
            spread = self.SHADOW * (1 - t)
            alpha = int(255 * shadow_strength * (t ** 2) / steps * 2.2)
            path = QPainterPath()
            path.addRoundedRect(
                card.adjusted(-spread, -spread + 4, spread, spread + 4),
                self.RADIUS + spread, self.RADIUS + spread,
            )
            p.fillPath(path, QColor(0, 0, 0, alpha))

        body = QPainterPath()
        body.addRoundedRect(card, self.RADIUS, self.RADIUS)
        p.fillPath(body, pal["bg"])

        border = QColor(pal["border"])
        border.setAlpha(255 if pal["dark"] else 220)
        p.setPen(QPen(border, 1))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(card.adjusted(0.5, 0.5, -0.5, -0.5), self.RADIUS, self.RADIUS)

        # Countdown bar along the bottom edge, clipped to the card's corners
        accent = pal["achievement"] if self.is_achievement else (
            pal[self.kind] if self.kind != "info" else pal["accent"]
        )
        p.save()
        p.setClipPath(body)
        track = QColor(accent)
        track.setAlpha(28)
        bar_h = 3
        p.fillRect(QRectF(card.x(), card.bottom() - bar_h, card.width(), bar_h), track)
        p.fillRect(QRectF(card.x(), card.bottom() - bar_h, card.width() * self._progress, bar_h), accent)
        p.restore()

    # -- lifecycle --------------------------------------------------------------

    def _target_pos(self):
        screen = QGuiApplication.screenAt(QCursor.pos()) or QApplication.primaryScreen()
        area = screen.availableGeometry()
        x = area.right() - self.width() + self.SHADOW - self.SCREEN_MARGIN + 1
        y = area.bottom() - self.height() + self.SHADOW - self.SCREEN_MARGIN + 1
        y -= self.slot.offset_below(self.STACK_GAP)
        return QPoint(x, y)

    def present(self):
        target = self._target_pos()
        self.move(target + QPoint(28, 0))
        self.setWindowOpacity(0.0)
        self.show()

        self.slide = QPropertyAnimation(self, b"pos", self)
        self.slide.setDuration(320)
        self.slide.setStartValue(self.pos())
        self.slide.setEndValue(target)
        self.slide.setEasingCurve(QEasingCurve.Type.OutCubic)

        self.fade = QPropertyAnimation(self, b"windowOpacity", self)
        self.fade.setDuration(220)
        self.fade.setStartValue(0.0)
        self.fade.setEndValue(1.0)
        self.fade.setEasingCurve(QEasingCurve.Type.OutCubic)

        self.slide.start()
        self.fade.start()
        self.clock.start()
        self.tick.start()

    def _on_tick(self):
        elapsed = self.clock.restart()
        self.remaining -= elapsed
        self._progress = max(0.0, self.remaining / self.duration)
        self.update()
        if self.remaining <= 0:
            self.close_notification()

    def enterEvent(self, event):
        # Hovering holds the notification open
        self.tick.stop()

    def leaveEvent(self, event):
        if not self.closing:
            self.clock.restart()
            self.tick.start()

    def mousePressEvent(self, event):
        event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            if self.card_rect().contains(event.position()):
                open_ascendara()
            self.close_notification()
        elif event.button() == Qt.MouseButton.RightButton:
            self.close_notification()

    def close_notification(self):
        if self.closing:
            return
        self.closing = True
        self.tick.stop()
        logger.info("Closing notification")

        self.slide_out = QPropertyAnimation(self, b"pos", self)
        self.slide_out.setDuration(200)
        self.slide_out.setStartValue(self.pos())
        self.slide_out.setEndValue(self.pos() + QPoint(28, 0))
        self.slide_out.setEasingCurve(QEasingCurve.Type.InCubic)

        self.fade_out = QPropertyAnimation(self, b"windowOpacity", self)
        self.fade_out.setDuration(200)
        self.fade_out.setStartValue(self.windowOpacity())
        self.fade_out.setEndValue(0.0)
        self.fade_out.setEasingCurve(QEasingCurve.Type.InCubic)
        self.fade_out.finished.connect(self.cleanup)

        self.slide_out.start()
        self.fade_out.start()

    def cleanup(self):
        self.slot.release()
        self.close()
        QApplication.instance().quit()


def open_ascendara():
    """Bring Ascendara forward. The app holds a single-instance lock, so launching
    it again just focuses the running window."""
    exe_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
    names = ["Ascendara.exe"] if sys.platform == "win32" else ["ascendara", "Ascendara"]
    for folder in (os.path.dirname(exe_dir), exe_dir):
        for name in names:
            candidate = os.path.join(folder, name)
            if os.path.isfile(candidate):
                try:
                    kwargs = {"creationflags": subprocess.DETACHED_PROCESS} if sys.platform == "win32" else {"start_new_session": True}
                    subprocess.Popen([candidate], cwd=folder, **kwargs)
                    logger.info(f"Launched: {candidate}")
                except Exception as e:
                    logger.error(f"Failed to launch {candidate}: {e}")
                return
    logger.warning("Could not find the Ascendara executable to open")


def main():
    parser = argparse.ArgumentParser(description='Show a notification with the specified theme')
    parser.add_argument('--theme', type=str, default='dark', help='Theme to use for the notification')
    parser.add_argument('--title', type=str, default='Notification', help='Title of the notification')
    parser.add_argument('--message', type=str, default='This is a notification', help='Message to display')
    parser.add_argument('--type', type=str, choices=['info', 'success', 'warning', 'error'], default=None, help='Notification type (inferred from the title when omitted)')
    parser.add_argument('--colors', type=str, default=None, help='Custom theme colors as JSON, overrides the saved custom theme')
    parser.add_argument('--duration', type=int, default=None, help='How long to show the notification, in milliseconds')
    parser.add_argument('--is-achievement', action='store_true', help='Is this an achievement notification?')
    parser.add_argument('--icon', type=str, default=None, help='Icon URL for the notification')
    parser.add_argument('--appid', type=str, default=None, help='AppID of the game')
    parser.add_argument('--game', type=str, default=None, help='Name of the game')
    parser.add_argument('--achievement', type=str, default=None, help='Name of the achievement')
    parser.add_argument('--description', type=str, default=None, help='Description of the achievement')
    args = parser.parse_args()

    logger.info(f"Starting notification helper with args: {args}")

    try:
        QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
        app = QApplication(sys.argv)
        app.setQuitOnLastWindowClosed(True)

        colors_override = None
        if args.colors:
            try:
                parsed = json.loads(args.colors)
                if isinstance(parsed, dict):
                    colors_override = parsed
            except json.JSONDecodeError as e:
                logger.warning(f"Ignoring invalid --colors JSON: {e}")

        theme = (args.theme or "dark").strip().lower()
        palette = resolve_palette(theme, colors_override)

        if args.is_achievement:
            # The watcher sends the achievement's display name as the message
            window = NotificationWindow(
                palette,
                args.game or "Achievement Unlocked!",
                args.message or "",
                is_achievement=True,
                icon=args.icon,
                game=args.game,
                achievement=args.message,
                description=args.description,
                duration=args.duration,
            )
        else:
            window = NotificationWindow(
                palette,
                args.title,
                args.message,
                kind=args.type or infer_type(args.title),
                duration=args.duration,
            )
        window.present()
        sys.exit(app.exec())
    except Exception as e:
        logger.error("Exception occurred:")
        traceback.print_exc()
        launch_crash_reporter(1, str(e))

if __name__ == "__main__":
    main()
