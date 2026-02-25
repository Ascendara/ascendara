# ==============================================================================
# Ascendara Notification Helper
# ==============================================================================
# A command-line tool for handling Ascendara notifications
# Read more about the Notification Helper Tool here:
# https://ascendara.app/docs/binary-tool/notification-helper






import sys
import os
from PyQt6.QtCore import Qt, QTimer, QEasingCurve, QPropertyAnimation, QRect, QSize, QPoint
from PyQt6.QtGui import QColor, QPainter, QPainterPath, QIcon, QPixmap
import subprocess
import atexit
import logging
import argparse
from typing import Literal
from PyQt6.QtWidgets import (
    QApplication, QWidget, QLabel, QPushButton, 
    QVBoxLayout, QHBoxLayout, QGraphicsOpacityEffect, QGraphicsDropShadowEffect
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

# Pre-compute theme colors as QColor objects
THEME_COLORS = {
    "light": {
        "bg": QColor(255, 255, 255),      # --color-background
        "fg": QColor(15, 23, 42),         # --color-foreground
        "border": QColor(226, 232, 240),  # --color-border
        "shadow": QColor(0, 0, 0, 50),    # subtle shadow
    },
    "dark": {
        "bg": QColor(15, 23, 42),         # --color-background
        "fg": QColor(241, 245, 249),      # --color-foreground
        "border": QColor(51, 65, 85),      # --color-border
        "shadow": QColor(0, 0, 0, 160),   # deeper shadow
    },
    "blue": {
        "bg": QColor(30, 41, 59),         # --color-background
        "fg": QColor(241, 245, 249),      # --color-foreground
        "border": QColor(59, 130, 246),    # --color-border
        "shadow": QColor(0, 0, 0, 120),
    },
    "purple": {
        "bg": QColor(88, 28, 135),        # --color-background
        "fg": QColor(237, 233, 254),      # --color-foreground
        "border": QColor(147, 51, 234),    # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "emerald": {
        "bg": QColor(6, 78, 59),          # --color-background
        "fg": QColor(209, 250, 229),      # --color-foreground
        "border": QColor(16, 185, 129),    # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "rose": {
        "bg": QColor(159, 18, 57),        # --color-background
        "fg": QColor(255, 228, 230),      # --color-foreground
        "border": QColor(244, 63, 94),     # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "cyberpunk": {
        "bg": QColor(17, 24, 39),         # --color-background
        "fg": QColor(236, 72, 153),       # --color-foreground
        "border": QColor(244, 114, 182),   # --color-border
        "shadow": QColor(0, 0, 0, 120),
    },
    "sunset": {
        "bg": QColor(124, 45, 18),        # --color-background
        "fg": QColor(254, 215, 170),      # --color-foreground
        "border": QColor(251, 146, 60),    # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "forest": {
        "bg": QColor(20, 83, 45),         # --color-background
        "fg": QColor(187, 247, 208),      # --color-foreground
        "border": QColor(34, 197, 94),     # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "midnight": {
        "bg": QColor(30, 41, 59),         # --color-background
        "fg": QColor(241, 245, 249),      # --color-foreground
        "border": QColor(51, 65, 85),      # --color-border
        "shadow": QColor(0, 0, 0, 120),
    },
    "amber": {
        "bg": QColor(120, 53, 15),        # --color-background
        "fg": QColor(254, 243, 199),      # --color-foreground
        "border": QColor(245, 158, 11),    # --color-border
        "shadow": QColor(0, 0, 0, 110),
    },
    "ocean": {
        "bg": QColor(12, 74, 110),        # --color-background
        "fg": QColor(186, 230, 253),      # --color-foreground
        "border": QColor(14, 165, 233),    # --color-border
        "shadow": QColor(0, 0, 0, 110),
    }
}

# Cache for icon pixmap
_icon_pixmap = None

def _launch_crash_reporter_on_exit(error_code, error_message):
    try:
        binary_name = 'AscendaraCrashReporter.exe' if sys.platform == 'win32' else 'AscendaraCrashReporter'
        crash_reporter_path = os.path.join('.', binary_name)
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

class NotificationWindow(QWidget):
    def __init__(self, theme: Literal["light", "dark", "blue", "purple", "emerald", "rose", "cyberpunk", "sunset", "forest", "midnight", "amber", "ocean"], title: str, message: str, is_achievement: bool = False, icon: str = None, appid: str = None, game: str = None, achievement: str = None, description: str = None):
        super().__init__()
        logger.info(f"Initializing notification with theme: {theme}, is_achievement: {is_achievement}")
        self.theme = theme if theme in THEME_COLORS else "dark"
        self.title = title
        self.message = message
        self.is_achievement = is_achievement
        self.icon = icon
        self.appid = appid
        self.game = game
        self.achievement = achievement
        self.description = description
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)
        self.bg_color = THEME_COLORS[self.theme]["bg"]
        self.fg_color = THEME_COLORS[self.theme]["fg"]
        self.border_color = THEME_COLORS[self.theme]["border"]
        self.shadow_color = THEME_COLORS[self.theme]["shadow"]
        if self.is_achievement:
            self._setup_achievement_ui()
        else:
            self._setup_ui()
        self._apply_shadow()
        self._set_position()
        self._animate_in()
        QTimer.singleShot(5000, self.close_notification)

    def _setup_ui(self):
        self.setMinimumWidth(320)
        self.setMaximumWidth(380)
        self.setMinimumHeight(80)
        self.setMaximumHeight(160)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        # Title
        title_label = QLabel(self.title)
        title_label.setStyleSheet(f"color: {self.fg_color.name()}; font-size: 15px; font-weight: 600; font-family: 'Segoe UI'; margin-bottom: 2px;")
        layout.addWidget(title_label)

        # Message
        message_label = QLabel(self.message)
        message_label.setStyleSheet(f"color: {self.fg_color.name()}; font-size: 13px; font-family: 'Segoe UI'; margin-bottom: 8px;")
        message_label.setWordWrap(True)
        layout.addWidget(message_label)

        # Action buttons (Open and Dismiss) positioned bottom right with padding
        button_container = QWidget()
        button_container_layout = QHBoxLayout(button_container)
        button_container_layout.setContentsMargins(0, 0, 8, 0)  # Right padding
        button_container_layout.setSpacing(10)
        button_container_layout.addStretch()

        open_button = QPushButton("Open")
        open_button.setCursor(Qt.CursorShape.PointingHandCursor)
        open_button.setStyleSheet(
            f"QPushButton {{ background: {self.fg_color.name()}; color: {self.bg_color.name()}; border: none; border-radius: 8px; "
            f"font-size: 13px; font-family: 'Segoe UI'; font-weight: 600; padding: 5px 18px; }} "
            f"QPushButton:hover {{ background: {self.border_color.name()}; color: {self.fg_color.name()}; }}"
        )
        open_button.clicked.connect(self._handle_open)
        button_container_layout.addWidget(open_button)

        dismiss_button = QPushButton("Dismiss")
        dismiss_button.setCursor(Qt.CursorShape.PointingHandCursor)
        dismiss_button.setStyleSheet(
            f"QPushButton {{ background: rgba(0,0,0,0.06); color: {self.fg_color.name()}; border: none; border-radius: 8px; "
            f"font-size: 13px; font-family: 'Segoe UI'; font-weight: 600; padding: 5px 18px; }} "
            f"QPushButton:hover {{ background: {self.fg_color.name()}; color: {self.bg_color.name()}; }}"
        )
        dismiss_button.clicked.connect(self.close_notification)
        button_container_layout.addWidget(dismiss_button)

        # Add vertical stretch before the button row to push to bottom
        layout.addStretch()
        layout.addWidget(button_container, alignment=Qt.AlignmentFlag.AlignRight)

        footer = QWidget()
        footer_layout = QHBoxLayout(footer)
        footer_layout.setContentsMargins(0, 0, 0, 0)
        footer_layout.addStretch()
        layout.addWidget(footer)

    def _setup_achievement_ui(self):
        self.setMinimumWidth(380)
        self.setMaximumWidth(400)
        self.setMinimumHeight(88)
        self.setMaximumHeight(120)
        # Card layout with accent bar visually merged
        card_layout = QHBoxLayout(self)
        card_layout.setContentsMargins(0, 0, 0, 0)
        card_layout.setSpacing(0)

        # Accent bar (gold), flush with card and shares border radius
        accent = QWidget()
        accent.setFixedWidth(8)
        accent.setStyleSheet("background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #FFD700, stop:1 #B8860B); border-top-left-radius: 16px; border-bottom-left-radius: 16px;")
        card_layout.addWidget(accent)

        # Main content area (rounded on right, flush left)
        content = QWidget()
        content_layout = QHBoxLayout(content)
        content_layout.setContentsMargins(10, 8, 16, 8)
        content_layout.setSpacing(10)
        content.setStyleSheet("border-top-right-radius: 16px; border-bottom-right-radius: 16px; background: #10182b;")

        # Icon (rounded, shadow, tight)
        icon_label = QLabel()
        icon_label.setFixedSize(44, 44)
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_label.setStyleSheet("border-radius: 8px; background: #232a3b; box-shadow: 0px 2px 8px rgba(0,0,0,0.10);")
        if self.icon:
            try:
                pixmap = QPixmap()
                if self.icon.startswith('http'):
                    import requests
                    from io import BytesIO
                    response = requests.get(self.icon, timeout=2)
                    if response.status_code == 200:
                        pixmap.loadFromData(response.content)
                else:
                    pixmap.load(self.icon)
                if not pixmap.isNull():
                    icon_label.setPixmap(pixmap.scaled(44, 44, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
                else:
                    icon_label.setText("🏆")
                    icon_label.setStyleSheet("font-size: 28px; border-radius: 8px; background: #FFD700; color: #232a3b; text-align: center;")
            except Exception as e:
                logger.warning(f"Failed to load achievement icon: {e}")
                icon_label.setText("🏆")
                icon_label.setStyleSheet("font-size: 28px; border-radius: 8px; background: #FFD700; color: #232a3b; text-align: center;")
        else:
            icon_label.setText("🏆")
            icon_label.setStyleSheet("font-size: 28px; border-radius: 8px; background: #FFD700; color: #232a3b; text-align: center;")
        content_layout.addWidget(icon_label, alignment=Qt.AlignmentFlag.AlignVCenter)

        # Info Column (tight, centered)
        info_col = QVBoxLayout()
        info_col.setSpacing(0)
        info_col.setContentsMargins(0, 0, 0, 0)

        # Trophy header (bold, gold, larger)
        unlocked_header = QLabel("🏆 Achievement Unlocked!")
        unlocked_header.setStyleSheet("color: #FFD700; font-size: 18px; font-weight: 900; font-family: 'Segoe UI', Arial, sans-serif; margin-bottom: 0px; letter-spacing: 0.5px;")
        unlocked_header.setAlignment(Qt.AlignmentFlag.AlignLeft)
        info_col.addWidget(unlocked_header)

        # Game name (bold, larger)
        game_label = QLabel(self.game or "")
        game_label.setStyleSheet(f"color: {self.fg_color.name()}; font-size: 17px; font-weight: bold; font-family: 'Segoe UI'; margin-bottom: 0px; text-shadow: 1px 1px 6px rgba(0,0,0,0.13);")
        info_col.addWidget(game_label)

        # Achievement name (larger, light)
        achievement_text = self.achievement or "Achievement Unlocked!"
        ach_label = QLabel(achievement_text)
        ach_label.setStyleSheet(f"color: {self.fg_color.name()}; font-size: 14px; font-family: 'Segoe UI', Arial, sans-serif; font-weight: 400; margin-bottom: 0px; letter-spacing: 0.2px; text-shadow: 1px 1px 6px rgba(0,0,0,0.09);")
        ach_label.setWordWrap(True)
        info_col.addWidget(ach_label)

        # If no achievement details, show a friendly message
        if not self.achievement or self.achievement.strip() == "":
            empty_label = QLabel("You just unlocked a new achievement!")
            empty_label.setStyleSheet(f"color: {self.fg_color.name()}; font-size: 13px; font-family: 'Segoe UI'; margin-top: 0px;")
            info_col.addWidget(empty_label)

        info_col.addStretch()
        content_layout.addLayout(info_col)
        content.setLayout(content_layout)
        card_layout.addWidget(content)

    def _handle_open(self):
        import subprocess
        exe_path = os.path.join(os.path.dirname("../Ascendara.exe"))
        try:
            subprocess.Popen([exe_path], shell=False)
            logger.info(f"Launched: {exe_path}")
        except Exception as e:
            logger.error(f"Failed to launch {exe_path}: {e}")
        self.close_notification()

    def _apply_shadow(self):
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(22)
        shadow.setXOffset(0)
        shadow.setYOffset(6)
        shadow.setColor(self.shadow_color)
        self.setGraphicsEffect(shadow)

    def _set_position(self):
        screen = QApplication.primaryScreen()
        geometry = screen.availableGeometry()  # Use availableGeometry for taskbar safety
        dpr = screen.devicePixelRatio() if hasattr(screen, 'devicePixelRatio') else 1.0
        # Use actual widget size for precise placement
        self.adjustSize()
        width, height = self.width(), self.height()
        margin_x, margin_y = int(18 * dpr), int(18 * dpr)
        x = geometry.x() + geometry.width() - width - margin_x
        y = geometry.y() + geometry.height() - height - margin_y
        self.setGeometry(x, y, width, height)
        logger.debug(f"Window positioned at: {x}, {y}")

    def _animate_in(self):
        self.opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.opacity_effect)
        self.opacity_effect.setOpacity(0.0)
        self.fade_in_animation = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_in_animation.setDuration(260)
        self.fade_in_animation.setStartValue(0.0)
        self.fade_in_animation.setEndValue(1.0)
        self.fade_in_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.fade_in_animation.start()
        self.move(self.x(), self.y() + 40)
        self.slide_in_animation = QPropertyAnimation(self, b"pos")
        self.slide_in_animation.setDuration(260)
        self.slide_in_animation.setStartValue(self.pos())
        self.slide_in_animation.setEndValue(self.pos() - QPoint(0, 40))
        self.slide_in_animation.setEasingCurve(QEasingCurve.Type.OutCubic)
        self.slide_in_animation.start()
        QTimer.singleShot(4000, self.close_notification)
        self.show()
        logger.debug("Window shown")

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Modern, softer rounded rectangle
        radius = 18
        path = QPainterPath()
        path.addRoundedRect(0, 0, self.width(), self.height(), radius, radius)

        # Draw background
        painter.setPen(Qt.PenStyle.NoPen)
        painter.fillPath(path, self.bg_color)

        # Draw subtle border with opacity
        border_color = QColor(self.border_color)
        border_color.setAlpha(110)
        painter.setPen(border_color)
        painter.drawPath(path)

    def close_notification(self):
        if hasattr(self, 'fade_out_animation'):
            return

        logger.info("Starting fade-out and slide-down animation")
        self.fade_out_animation = QPropertyAnimation(self.opacity_effect, b"opacity")
        self.fade_out_animation.setDuration(180)
        self.fade_out_animation.setStartValue(1.0)
        self.fade_out_animation.setEndValue(0.0)
        self.fade_out_animation.setEasingCurve(QEasingCurve.Type.InCubic)
        self.fade_out_animation.finished.connect(self.cleanup)
        self.fade_out_animation.start()

        self.slide_out_animation = QPropertyAnimation(self, b"pos")
        self.slide_out_animation.setDuration(180)
        self.slide_out_animation.setStartValue(self.pos())
        self.slide_out_animation.setEndValue(self.pos() + QPoint(0, 40))
        self.slide_out_animation.setEasingCurve(QEasingCurve.Type.InCubic)
        self.slide_out_animation.start()

    def cleanup(self):
        logger.info("Cleanup: closing window and quitting application")
        self.close()
        QApplication.instance().quit()

    def _set_fallback_icon(self, label):
        """Set fallback 'A' icon when the icon file cannot be loaded"""
        label.setText("A")
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setStyleSheet(f"""
            QLabel {{
                background-color: {self.border_color.name()};
                color: {self.fg_color.name()};
                border-radius: 12px;
                font-family: 'Segoe UI';
                font-size: 15px;
                font-weight: 600;
                min-width: 24px;
                min-height: 24px;
                max-width: 24px;
                max-height: 24px;
                text-align: center;
                opacity: 0.85;
            }}
        """)

import traceback

def main():
    parser = argparse.ArgumentParser(description='Show a notification with the specified theme')
    parser.add_argument('--theme', type=str, default='dark', help='Theme to use for the notification')
    parser.add_argument('--title', type=str, default='Notification', help='Title of the notification')
    parser.add_argument('--message', type=str, default='This is a notification', help='Message to display')
    parser.add_argument('--is-achievement', action='store_true', help='Is this an achievement notification?')
    parser.add_argument('--icon', type=str, default=None, help='Icon URL for the notification')
    parser.add_argument('--appid', type=str, default=None, help='AppID of the game')
    parser.add_argument('--game', type=str, default=None, help='Name of the game')
    parser.add_argument('--achievement', type=str, default=None, help='Name of the achievement')
    parser.add_argument('--description', type=str, default=None, help='Description of the achievement')
    args = parser.parse_args()
    
    logger.info(f"Starting notification helper with args: {args}")
    
    try:
        app = QApplication(sys.argv)
        if args.is_achievement:
            # For achievements, use game as title and message as achievement name
            window = NotificationWindow(
                args.theme,
                args.game or "Achievement Unlocked!",
                args.message or "",
                is_achievement=True,
                icon=args.icon,
                appid=args.appid,
                game=args.game,  # Game name for display
                achievement=args.message,  # Achievement name for display
                description=None
            )
        else:
            # For standard notifications, only use theme, title, message
            window = NotificationWindow(
                args.theme,
                args.title,
                args.message,
                is_achievement=False
            )
        sys.exit(app.exec())
    except Exception as e:
        logger.error("Exception occurred:")
        traceback.print_exc()
        launch_crash_reporter(1, str(e))

if __name__ == "__main__":
    main()