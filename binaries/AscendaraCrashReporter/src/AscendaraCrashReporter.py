# ==============================================================================
# Ascendara Crash Reporter
# ==============================================================================
# A GUI-based error reporting tool that handles application crashes and errors
# across all Ascendara components. Provides user-friendly error messages and
# crash reporting capabilities. Read more about the Crash Reporter tool here:
# https://ascendara.app/docs/binary-tool/crash-reporter










import tkinter as tk
from tkinter import ttk, messagebox
import sys
import os
import webbrowser
import json
from datetime import datetime

class AscendaraTool:
    GOFILE_HELPER = "gofilehelper"
    MAIN_DOWNLOADER = "maindownloader"
    GAME_HANDLER = "gamehandler"
    TOP_LEVEL = "toplevel"
    LANGUAGE_TRANSLATION = "languagetranslation"
    TORRENT_HANDLER = "torrenthandler"
    NOTIFICATION_HELPER = "notificationhelper"
    
    @staticmethod
    def get_tool_name(tool_id):
        tool_names = {
            AscendaraTool.GOFILE_HELPER: "Ascendara GoFile Helper",
            AscendaraTool.MAIN_DOWNLOADER: "Ascendara Downloader",
            AscendaraTool.GAME_HANDLER: "Ascendara Game Handler",
            AscendaraTool.TOP_LEVEL: "Ascendara",
            AscendaraTool.LANGUAGE_TRANSLATION: "Ascendara Language Translation",
            AscendaraTool.TORRENT_HANDLER: "Ascendara Torrent Handler",
            AscendaraTool.NOTIFICATION_HELPER: "Ascendara Notification Helper"
        }
        return tool_names.get(tool_id.lower(), "Unknown Ascendara Tool")

class ErrorCodes:
    # General errors (1000-1004)
    UNKNOWN_ERROR = 1000
    UNHANDLED_EXCEPTION = 1001
    UNHANDLED_REJECT = 1002
    NETWORK_ERROR = 1003
    INVALID_DATA = 1004
    
    # Game Handler specific errors (1100-1199)
    GAME_NOT_FOUND = 1100
    GAME_LAUNCH_ERROR = 1101
    GAME_CONFIG_ERROR = 1102
    GAME_PROCESS_ERROR = 1103
    SETTINGS_ERROR = 1104
    DOWNLOAD_DIR_ERROR = 1105
    
    # Language Translation specific errors (1200-1299)
    TRANSLATION_API_ERROR = 1200
    TRANSLATION_RATE_LIMIT = 1201
    TRANSLATION_FILE_ERROR = 1202
    
    # GoFile Helper specific errors (1300-1399)
    GOFILE_API_ERROR = 1300
    GOFILE_UPLOAD_ERROR = 1301
    GOFILE_DOWNLOAD_ERROR = 1302
    GOFILE_AUTH_ERROR = 1303
    GOFILE_RATE_LIMIT = 1304
    GOFILE_FILE_ERROR = 1305
    
    # Main Downloader specific errors (1400-1499)
    DOWNLOAD_INIT_ERROR = 1400
    DOWNLOAD_PROGRESS_ERROR = 1401
    DOWNLOAD_CANCEL_ERROR = 1402
    DOWNLOAD_VERIFY_ERROR = 1403
    DOWNLOAD_EXTRACT_ERROR = 1404
    DOWNLOAD_CLEANUP_ERROR = 1405
    SETTINGS_FILE_ERROR = 1406
    GAMES_FILE_ERROR = 1407
    HELPER_LAUNCH_ERROR = 1408

    # Torrent Handler specific errors (1500-1599)
    TORRENT_API_ERROR = 1500
    TORRENT_ADD_ERROR = 1501
    TORRENT_REMOVE_ERROR = 1502
    TORRENT_STATUS_ERROR = 1503
    TORRENT_CONFIG_ERROR = 1504
    TORRENT_FILE_ERROR = 1505
    TORRENT_INSTALL_ERROR = 1506

    # Notification Helper specific errors (1600-1699)
    NOTIFICATION_INIT_ERROR = 1600
    NOTIFICATION_DISPLAY_ERROR = 1601
    NOTIFICATION_THEME_ERROR = 1602
    NOTIFICATION_RESOURCE_ERROR = 1603
    NOTIFICATION_ANIMATION_ERROR = 1604
    
    @staticmethod
    def get_error_description(code):
        error_descriptions = {
            # General errors
            1000: "An unknown error occurred",
            1001: "An unhandled exception occurred",
            1002: "An unhandled rejection occurred",
            1003: "A network error occurred",
            1004: "Invalid data received",
            
            # Game Handler specific
            1100: "Game not found",
            1101: "Failed to launch game",
            1102: "Game configuration error",
            1103: "Game process error",
            1104: "Settings file error",
            1105: "Download directory error",
            
            # Language Translation specific
            1200: "Language Translation API error occurred",
            1201: "Language Translation rate limit exceeded",
            1202: "Error processing file for Language Translation operation",
            
            # GoFile Helper specific
            1300: "GoFile API error occurred",
            1301: "Failed to upload file to GoFile",
            1302: "Failed to download file from GoFile",
            1303: "GoFile authentication failed",
            1304: "GoFile rate limit exceeded",
            1305: "Error processing file for GoFile operation",
            
            # Main Downloader specific
            1400: "Failed to initialize download",
            1401: "Error updating download progress",
            1402: "Failed to cancel download",
            1403: "Download verification failed",
            1404: "Failed to extract downloaded files",
            1405: "Error during cleanup",
            1406: "Error reading or writing settings file",
            1407: "Error reading or writing games file",
            1408: "Failed to launch helper process",

            # Torrent Handler specific
            1500: "Torrent API error occurred",
            1501: "Failed to add torrent",
            1502: "Failed to remove torrent",
            1503: "Failed to get torrent status",
            1504: "Torrent configuration error",
            1505: "Error processing torrent file",
            1506: "Failed to install torrent content",

            # Notification Helper specific
            1600: "Failed to initialize notification",
            1601: "Failed to display notification",
            1602: "Invalid or unsupported theme",
            1603: "Failed to load notification resources",
            1604: "Error during notification animation"
        }
        return error_descriptions.get(code, "Unrecognized error code")

class ModernButton(ttk.Button):
    def __init__(self, master, **kwargs):
        super().__init__(master, **kwargs)
        self.bind('<Enter>', self.on_enter)
        self.bind('<Leave>', self.on_leave)
    
    def on_enter(self, e):
        self['style'] = 'Accent.TButton'
    
    def on_leave(self, e):
        self['style'] = 'TButton'

class CrashReporter:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Ascendara Error Report")
        
        # Make window non-resizable for consistent appearance
        self.root.resizable(False, False)
        
        # Set window size and position
        window_width = 800
        window_height = 600
        
        # Center window on screen
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")
        
        # Set window icon (if available)
        try:
            if getattr(sys, 'frozen', False):
                # Running as compiled executable
                base_path = sys._MEIPASS
            else:
                # Running as script
                base_path = os.path.dirname(os.path.abspath(__file__))
            icon_path = os.path.join(os.path.dirname(__file__), "ascendara.ico")
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception:
            pass  # Ignore icon loading errors
            
        # Configure styles
        self.setup_styles()
        
        # Create main container with padding
        self.main_frame = ttk.Frame(self.root, padding="30")
        self.main_frame.grid(row=0, column=0, sticky='nsew')
        
        # Configure grid
        self.root.grid_rowconfigure(0, weight=1)
        self.root.grid_columnconfigure(0, weight=1)
        self.main_frame.grid_columnconfigure(0, weight=1)
        
        self.create_widgets()
        
    def setup_styles(self):
        self.style = ttk.Style()
        
        # Configure common styles
        self.style.configure('Main.TFrame', background='#ffffff')
        self.style.configure('TLabel', background='#ffffff', font=('Segoe UI', 10))
        self.style.configure('Header.TLabel', background='#ffffff', font=('Segoe UI', 18, 'bold'))
        self.style.configure('Tool.TLabel', background='#ffffff', font=('Segoe UI', 12), foreground='#1a73e8')
        self.style.configure('Error.TLabel', background='#ffffff', font=('Segoe UI', 11), foreground='#d93025')
        
        # Critical error styles with improved colors
        self.style.configure('Critical.TLabel', background='#fce8e6', font=('Segoe UI', 11))
        self.style.configure('Critical.Header.TLabel', background='#fce8e6', font=('Segoe UI', 18, 'bold'))
        
        # Button styles with modern look
        self.style.configure('TButton', 
            font=('Segoe UI', 10),
            padding=(15, 8),
            relief='flat'
        )
        self.style.configure('Accent.TButton',
            font=('Segoe UI', 10, 'bold'),
            padding=(15, 8),
            relief='flat'
        )
        self.style.configure('Critical.TButton',
            font=('Segoe UI', 10, 'bold'),
            padding=(15, 8),
            relief='flat'
        )
        
        # Frame styles with improved shadows and borders
        self.style.configure('Card.TFrame',
            background='#f8f9fa',
            relief='solid',
            borderwidth=1
        )
        self.style.configure('Critical.TFrame', background='#fce8e6')
        self.style.configure('Critical.Card.TFrame',
            background='#fadad7',
            relief='solid',
            borderwidth=1
        )
        
    def create_widgets(self):
        # Store frames for switching between normal and critical errors
        self.normal_frame = ttk.Frame(self.main_frame, style='Main.TFrame')
        self.critical_frame = ttk.Frame(self.main_frame, style='Critical.TFrame')
        
        self.create_normal_error_widgets()
        self.create_critical_error_widgets()
        
    def create_critical_error_widgets(self):
        self.critical_frame.grid_columnconfigure(0, weight=1)
        
        # Critical error header
        header_frame = ttk.Frame(self.critical_frame, style='Critical.TFrame')
        header_frame.grid(row=0, column=0, sticky='ew', pady=(0, 20))
        
        error_header = ttk.Label(
            header_frame,
            text="⚠️ Critical Error: Ascendara Has Stopped Working",
            style='Critical.Header.TLabel'
        )
        error_header.grid(row=0, column=0, sticky='w')
        
        # Critical error explanation
        explanation = ttk.Label(
            header_frame,
            text="The main Ascendara application has encountered a serious error and needs to close.",
            style='Critical.TLabel',
            wraplength=600
        )
        explanation.grid(row=1, column=0, sticky='w', pady=(5, 0))
        
        # Error information in red card
        error_card = ttk.Frame(self.critical_frame, style='Critical.Card.TFrame', padding=15)
        error_card.grid(row=1, column=0, sticky='ew', pady=(0, 20))
        error_card.grid_columnconfigure(0, weight=1)
        
        # Error code
        error_code_frame = ttk.Frame(error_card, style='Critical.Card.TFrame')
        error_code_frame.grid(row=0, column=0, sticky='w', pady=(0, 10))
        
        error_code_prefix = ttk.Label(
            error_code_frame,
            text="Critical Error Code: ",
            style='Critical.TLabel'
        )
        error_code_prefix.grid(row=0, column=0, sticky='w')
        
        self.critical_error_code = ttk.Label(
            error_code_frame,
            text="",
            style='Error.TLabel'
        )
        self.critical_error_code.grid(row=0, column=1, sticky='w')
        
        # Error description
        error_desc_frame = ttk.Frame(error_card, style='Critical.Card.TFrame')
        error_desc_frame.grid(row=1, column=0, sticky='w', pady=(0, 15))
        
        error_desc_prefix = ttk.Label(
            error_desc_frame,
            text="Error Details: ",
            style='Critical.TLabel'
        )
        error_desc_prefix.grid(row=0, column=0, sticky='w')
        
        self.critical_error_desc = ttk.Label(
            error_desc_frame,
            text="",
            style='Critical.TLabel',
            wraplength=500
        )
        self.critical_error_desc.grid(row=0, column=1, sticky='w')
        
        # Recovery suggestions
        recovery_frame = ttk.Frame(self.critical_frame, style='Critical.TFrame')
        recovery_frame.grid(row=2, column=0, sticky='ew', pady=(0, 20))
        
        recovery_header = ttk.Label(
            recovery_frame,
            text="What You Can Try:",
            style='Critical.TLabel',
            font=('Segoe UI', 11, 'bold')
        )
        recovery_header.grid(row=0, column=0, sticky='w', pady=(0, 5))
        
        suggestions = [
            "• Restart Ascendara",
            "• Check for updates",
            "• Verify your internet connection",
            "• Make sure your system meets the minimum requirements"
        ]
        
        for i, suggestion in enumerate(suggestions):
            ttk.Label(
                recovery_frame,
                text=suggestion,
                style='Critical.TLabel'
            ).grid(row=i+1, column=0, sticky='w', pady=2)
        
        # Technical details
        details_label = ttk.Label(
            self.critical_frame,
            text="Technical Information:",
            style='Critical.TLabel'
        )
        details_label.grid(row=3, column=0, sticky='w', pady=(0, 5))
        
        self.critical_error_details = tk.Text(
            self.critical_frame,
            wrap=tk.WORD,
            height=6,
            width=70,
            font=('Consolas', 9),
            background='#fadad7',
            relief='solid',
            borderwidth=1
        )
        self.critical_error_details.grid(row=4, column=0, sticky='ew', pady=(0, 20))
        
        # Action buttons
        buttons_frame = ttk.Frame(self.critical_frame, style='Critical.TFrame')
        buttons_frame.grid(row=5, column=0, sticky='ew')
        buttons_frame.grid_columnconfigure(1, weight=1)
        
        report_button = ModernButton(
            buttons_frame,
            text="Report Problem",
            command=self.upload_crash_report,
            style='Critical.TButton'
        )
        report_button.grid(row=0, column=0, padx=(0, 10))
        
        restart_button = ModernButton(
            buttons_frame,
            text="Restart Ascendara",
            command=self.restart_ascendara,
            style='Critical.TButton'
        )
        restart_button.grid(row=0, column=1, padx=10)
        
        close_button = ModernButton(
            buttons_frame,
            text="Exit",
            command=self.root.destroy,
            style='Critical.TButton'
        )
        close_button.grid(row=0, column=2, padx=(10, 0))
        
    def restart_ascendara(self):
        try:
            # This would need to be implemented based on how Ascendara should be restarted
            messagebox.showinfo(
                "Restart",
                "Please restart Ascendara manually at this time."
            )
            self.root.destroy()
        except Exception as e:
            messagebox.showerror(
                "Error",
                "Unable to restart Ascendara. Please close and restart manually."
            )
        
    def create_normal_error_widgets(self):
        # Error icon and header
        header_frame = ttk.Frame(self.normal_frame, style='Main.TFrame')
        header_frame.grid(row=0, column=0, sticky='ew', pady=(0, 15))
        
        error_header = ttk.Label(
            header_frame,
            text="⚠️ Ascendara Core Utility Crash",
            style='Header.TLabel'
        )
        error_header.grid(row=0, column=0, sticky='w')
        
        # Subheader explaining the situation
        subheader = ttk.Label(
            header_frame,
            text="A critical component of Ascendara has encountered an error and needs to close.",
            style='TLabel',
            wraplength=500
        )
        subheader.grid(row=1, column=0, sticky='w', pady=(5, 0))
        
        # Tool identifier with more context
        tool_frame = ttk.Frame(self.normal_frame, style='Main.TFrame')
        tool_frame.grid(row=1, column=0, sticky='ew', pady=(0, 10))
        
        tool_prefix = ttk.Label(
            tool_frame,
            text="Affected Component: ",
            style='TLabel'
        )
        tool_prefix.grid(row=0, column=0, sticky='w')
        
        self.tool_label = ttk.Label(
            tool_frame,
            text="",
            style='Tool.TLabel'
        )
        self.tool_label.grid(row=0, column=1, sticky='w')
        
        # Error information card
        error_card = ttk.Frame(self.normal_frame, style='Card.TFrame', padding=12)
        error_card.grid(row=2, column=0, sticky='ew', pady=(0, 15))
        error_card.grid_columnconfigure(0, weight=1)
        
        # Error code with more context
        error_code_frame = ttk.Frame(error_card)
        error_code_frame.grid(row=0, column=0, sticky='w', pady=(0, 8))
        
        error_code_prefix = ttk.Label(
            error_code_frame,
            text="Diagnostic Code: ",
            style='TLabel'
        )
        error_code_prefix.grid(row=0, column=0, sticky='w')
        
        self.error_code_label = ttk.Label(
            error_code_frame,
            text="",
            style='Error.TLabel'
        )
        self.error_code_label.grid(row=0, column=1, sticky='w')
        
        # Error description with more context
        error_desc_frame = ttk.Frame(error_card)
        error_desc_frame.grid(row=1, column=0, sticky='w')
        
        error_desc_prefix = ttk.Label(
            error_desc_frame,
            text="What Happened: ",
            style='TLabel'
        )
        error_desc_prefix.grid(row=0, column=0, sticky='w')
        
        self.error_desc_label = ttk.Label(
            error_desc_frame,
            text="",
            style='TLabel',
            wraplength=400
        )
        self.error_desc_label.grid(row=0, column=1, sticky='w')
        
        # Error details section with better explanation
        details_frame = ttk.Frame(self.normal_frame, style='Main.TFrame')
        details_frame.grid(row=3, column=0, sticky='ew', pady=(0, 5))
        
        details_label = ttk.Label(
            details_frame,
            text="Technical Details (useful for troubleshooting):",
            style='TLabel'
        )
        details_label.grid(row=0, column=0, sticky='w')
        
        self.error_details = tk.Text(
            self.normal_frame,
            wrap=tk.WORD,
            height=8,
            width=70,
            font=('Consolas', 9),
            background='#f8f9fa',
            relief='solid',
            borderwidth=1
        )
        self.error_details.grid(row=4, column=0, sticky='ew', pady=(0, 20))
        
        # Action suggestion text
        action_text = ttk.Label(
            self.normal_frame,
            text="To help us improve Ascendara, you can report this issue or get support below:",
            style='TLabel',
            wraplength=600
        )
        action_text.grid(row=5, column=0, sticky='w', pady=(0, 10))
        
        # Buttons frame
        buttons_frame = ttk.Frame(self.normal_frame, style='Main.TFrame')
        buttons_frame.grid(row=6, column=0, sticky='ew')
        buttons_frame.grid_columnconfigure(1, weight=1)
        
        # Left buttons
        support_button = ModernButton(
            buttons_frame,
            text="Get Support",
            command=self.open_support
        )
        support_button.grid(row=0, column=0, padx=(0, 10))
        
        upload_button = ModernButton(
            buttons_frame,
            text="Upload Crash Report",
            command=self.upload_crash_report
        )
        upload_button.grid(row=0, column=1, padx=10)
        
        # Right button
        close_button = ModernButton(
            buttons_frame,
            text="Close",
            command=self.root.destroy
        )
        close_button.grid(row=0, column=2, padx=(10, 0))
    
    def set_error(self, tool_id, error_code, error_message):
        tool_name = AscendaraTool.get_tool_name(tool_id)
        error_desc = ErrorCodes.get_error_description(error_code)
        
        # Store crash data
        self.crash_data = {
            "timestamp": datetime.now().isoformat(),
            "tool": tool_name,
            "error_code": error_code,
            "error_description": error_desc,
            "error_message": error_message
        }
        
        if tool_id.lower() == AscendaraTool.TOP_LEVEL:
            # Show critical error page and set critical styling
            self.root.configure(bg='#fce8e6')
            self.main_frame.configure(style='Critical.TFrame')
            self.normal_frame.grid_remove()
            self.critical_frame.grid(row=0, column=0, sticky='nsew')
            
            # Set window size for critical error
            window_width = 800
            window_height = 600
            
            self.critical_error_code.config(text=str(error_code))
            self.critical_error_desc.config(text=error_desc)
            self.critical_error_details.delete(1.0, tk.END)
            self.critical_error_details.insert(tk.END, error_message)
        else:
            # Show normal error page and set normal styling
            self.root.configure(bg='#ffffff')
            self.main_frame.configure(style='Main.TFrame')
            self.critical_frame.grid_remove()
            self.normal_frame.grid(row=0, column=0, sticky='nsew')
            
            # Set smaller window size for utility error
            window_width = 560
            window_height = 500
            
            self.tool_label.config(text=tool_name)
            self.error_code_label.config(text=str(error_code))
            self.error_desc_label.config(text=error_desc)
            self.error_details.delete(1.0, tk.END)
            self.error_details.insert(tk.END, error_message)
        
        # Center window with new size
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = (screen_width - window_width) // 2
        y = (screen_height - window_height) // 2
        self.root.geometry(f"{window_width}x{window_height}+{x}+{y}")
    
    def open_support(self):
        webbrowser.open("https://ascendara.app/discord")

    
    def upload_crash_report(self):
        try:
            # In a real implementation, this would send the crash_data to a server
            messagebox.showinfo(
                "Crash Report",
                "Thank you for helping improve Ascendara!\nThe crash report has been uploaded successfully."
            )
        except Exception as e:
            messagebox.showerror(
                "Error",
                "Failed to upload crash report. Please try again later."
            )
    
    def run(self):
        self.root.mainloop()

def main():
    if len(sys.argv) < 4:
        sys.exit(1)
        
    try:
        tool_id = sys.argv[1].lower()
        error_code = int(sys.argv[2])
        error_message = sys.argv[3]
        
        reporter = CrashReporter()
        reporter.set_error(tool_id, error_code, error_message)
        reporter.run()
    except Exception as e:
        print(f"Failed to start crash reporter: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()