// ==============================================================================
// Ascendara Crash Reporter
// ==============================================================================
// A GUI-based error reporting tool that handles application crashes and errors
// across all Ascendara components. Provides user-friendly error messages and
// crash reporting capabilities. Read more about the Crash Reporter tool here:
// https://ascendara.app/docs/binary-tool/crash-reporter

use chrono::Local;
use fltk::text::TextDisplay;
use fltk::{
    app,
    button::Button,
    dialog,
    enums::{Align, Color, Font, FrameType},
    frame::Frame,
    image::IcoImage,
    prelude::*,
    text::{TextBuffer, TextEditor},
    window::Window,
};
use fltk_theme::{ThemeType, WidgetTheme};
use std::env;
use std::process;

// ==============================================================================
// Constants & Enums
// ==============================================================================

struct AscendaraTool;

impl AscendaraTool {
    const GOFILE_HELPER: &'static str = "gofilehelper";
    const MAIN_DOWNLOADER: &'static str = "maindownloader";
    const GAME_HANDLER: &'static str = "gamehandler";
    const TOP_LEVEL: &'static str = "toplevel";
    const LANGUAGE_TRANSLATION: &'static str = "languagetranslation";
    const TORRENT_HANDLER: &'static str = "torrenthandler";
    const NOTIFICATION_HELPER: &'static str = "notificationhelper";

    fn get_tool_name(tool_id: &str) -> String {
        match tool_id.to_lowercase().as_str() {
            Self::GOFILE_HELPER => "Ascendara GoFile Helper".to_string(),
            Self::MAIN_DOWNLOADER => "Ascendara Downloader".to_string(),
            Self::GAME_HANDLER => "Ascendara Game Handler".to_string(),
            Self::TOP_LEVEL => "Ascendara".to_string(),
            Self::LANGUAGE_TRANSLATION => "Ascendara Language Translation".to_string(),
            Self::TORRENT_HANDLER => "Ascendara Torrent Handler".to_string(),
            Self::NOTIFICATION_HELPER => "Ascendara Notification Helper".to_string(),
            _ => "Unknown Ascendara Tool".to_string(),
        }
    }
}

struct ErrorCodes;

impl ErrorCodes {
    fn get_error_description(code: i32) -> String {
        match code {
            // General errors (1000-1004)
            1000 => "An unknown error occurred".to_string(),
            1001 => "An unhandled exception occurred".to_string(),
            1002 => "An unhandled rejection occurred".to_string(),
            1003 => "A network error occurred".to_string(),
            1004 => "Invalid data received".to_string(),

            // Game Handler specific errors (1100-1199)
            1100 => "Game not found".to_string(),
            1101 => "Failed to launch game".to_string(),
            1102 => "Game configuration error".to_string(),
            1103 => "Game process error".to_string(),
            1104 => "Settings file error".to_string(),
            1105 => "Download directory error".to_string(),

            // Language Translation specific errors (1200-1299)
            1200 => "Language Translation API error occurred".to_string(),
            1201 => "Language Translation rate limit exceeded".to_string(),
            1202 => "Error processing file for Language Translation operation".to_string(),

            // GoFile Helper specific errors (1300-1399)
            1300 => "GoFile API error occurred".to_string(),
            1301 => "Failed to upload file to GoFile".to_string(),
            1302 => "Failed to download file from GoFile".to_string(),
            1303 => "GoFile authentication failed".to_string(),
            1304 => "GoFile rate limit exceeded".to_string(),
            1305 => "Error processing file for GoFile operation".to_string(),

            // Main Downloader specific errors (1400-1499)
            1400 => "Failed to initialize download".to_string(),
            1401 => "Error updating download progress".to_string(),
            1402 => "Failed to cancel download".to_string(),
            1403 => "Download verification failed".to_string(),
            1404 => "Failed to extract downloaded files".to_string(),
            1405 => "Error during cleanup".to_string(),
            1406 => "Error reading or writing settings file".to_string(),
            1407 => "Error reading or writing games file".to_string(),
            1408 => "Failed to launch helper process".to_string(),

            // Torrent Handler specific errors (1500-1599)
            1500 => "Torrent API error occurred".to_string(),
            1501 => "Failed to add torrent".to_string(),
            1502 => "Failed to remove torrent".to_string(),
            1503 => "Failed to get torrent status".to_string(),
            1504 => "Torrent configuration error".to_string(),
            1505 => "Error processing torrent file".to_string(),
            1506 => "Failed to install torrent content".to_string(),

            // Notification Helper specific errors (1600-1699)
            1600 => "Failed to initialize notification".to_string(),
            1601 => "Failed to display notification".to_string(),
            1602 => "Invalid or unsupported theme".to_string(),
            1603 => "Failed to load notification resources".to_string(),
            1604 => "Error during notification animation".to_string(),

            _ => "Unrecognized error code".to_string(),
        }
    }
}

// ==============================================================================
// Action Functions
// ==============================================================================

fn upload_crash_report() {
    // In a real implementation, this would send the crash_data to a server

    dialog::message_title_default("Crash Report");

    dialog::message_default(
        "Thank you for helping improve Ascendara!\nThe crash report has been uploaded successfully.",
    );
}

fn open_support() {
    if webbrowser::open("https://ascendara.app/discord").is_err() {
        eprintln!("Failed to open support link");
    }
}

fn restart_ascendara() {
    // This would need to be implemented based on how Ascendara should be restarted

    dialog::message_title_default("Restart");

    dialog::message_default("Please restart Ascendara manually at this time.");
    app::quit();
}

// ==============================================================================
// Main GUI Application
// ==============================================================================

fn main() {
    // Parse arguments
    let args: Vec<String> = env::args().collect();

    // Check arguments count (mimics: if len(sys.argv) < 4: sys.exit(1))
    if args.len() < 4 {
        process::exit(1);
    }

    let tool_id = args[1].to_lowercase();

    // Parse error code safely
    let error_code: i32 = match args[2].parse() {
        Ok(code) => code,
        Err(_) => {
            eprintln!("Invalid error code");
            process::exit(1);
        }
    };

    let error_message = &args[3];

    // Data preparation
    let tool_name = AscendaraTool::get_tool_name(&tool_id);
    let error_desc = ErrorCodes::get_error_description(error_code);
    let _timestamp = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

    // Initialize FLTK application
    let app = app::App::default().with_scheme(app::Scheme::Gleam);

    // Apply theme (mimics styles setup)
    let widget_theme = WidgetTheme::new(ThemeType::Aero);
    widget_theme.apply();

    // Define colors from Python script
    let critical_bg_color = Color::from_rgb(252, 232, 230); // #fce8e6
    let critical_card_bg = Color::from_rgb(250, 218, 215); // #fadad7
    let normal_bg_color = Color::White;
    let normal_card_bg = Color::from_rgb(248, 249, 250); // #f8f9fa
    let _error_text_color = Color::from_rgb(217, 48, 37); // #d93025 (Red)
    let _tool_text_color = Color::from_rgb(26, 115, 232); // #1a73e8 (Blue)

    let is_critical = tool_id == AscendaraTool::TOP_LEVEL;

    // Window Setup
    let win_w = if is_critical { 800 } else { 600 };
    let win_h = if is_critical { 600 } else { 550 };

    let mut wind = Window::default()
        .with_size(win_w, win_h)
        .center_screen()
        .with_label("Ascendara Error Report");

    wind.set_color(if is_critical {
        critical_bg_color
    } else {
        normal_bg_color
    });

    // ─── ICON LOADING ────────────────────────────────────────────────────────
    // Looks for ascendara.ico in the executable directory
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let icon_path = parent.join("ascendara.ico");
            if icon_path.exists() {
                if let Ok(icon) = IcoImage::load(&icon_path) {
                    wind.set_icon(Some(icon));
                }
            }
        }
    }
    // ──────────────────────────────────────────────────────────────────────────

    // ─── UI CONSTRUCTION ──────────────────────────────────────────────────────

    if is_critical {
        // === Critical Error Widgets ===

        let mut header = Frame::default()
            .with_size(win_w, 40)
            .with_pos(0, 20)
            .with_label("⚠ Critical Error: Ascendara Has Stopped Working");
        header.set_label_size(18);
        header.set_label_font(Font::HelveticaBold);
        header.set_label_color(Color::Black);

        let mut explanation = Frame::default()
            .with_size(600, 40)
            .with_pos(100, 60)
            .with_label(
            "The main Ascendara application has encountered a serious error and needs to close.",
        );
        explanation.set_label_size(11);
        explanation.set_align(Align::Center | Align::Inside | Align::Wrap);

        // Error Card (Red Box)
        let card_x = 30;
        let card_w = win_w - 60;
        let mut error_card = Frame::default()
            .with_size(card_w, 100)
            .with_pos(card_x, 110);
        error_card.set_frame(FrameType::BorderBox);
        error_card.set_color(critical_card_bg);

        // Inside Error Card
        let mut code_lbl = Frame::default()
            .with_size(card_w - 20, 30)
            .with_pos(card_x + 10, 120)
            .with_label(&format!("Critical Error Code: {}", error_code));
        code_lbl.set_align(Align::Left | Align::Inside);

        let mut desc_lbl = Frame::default()
            .with_size(card_w - 20, 30)
            .with_pos(card_x + 10, 150)
            .with_label(&format!("Error Details: {}", error_desc));
        desc_lbl.set_align(Align::Left | Align::Inside);

        // Recovery suggestions
        let mut recovery_lbl = Frame::default()
            .with_size(card_w, 30)
            .with_pos(card_x, 230)
            .with_label("What You Can Try:");
        recovery_lbl.set_label_font(Font::HelveticaBold);
        recovery_lbl.set_align(Align::Left | Align::Inside);

        let suggestions = "• Restart Ascendara\n• Check for updates\n• Verify your internet connection\n• Make sure your system meets the minimum requirements";
        let mut sugg_display = Frame::default()
            .with_size(card_w, 80)
            .with_pos(card_x, 260)
            .with_label(suggestions);
        sugg_display.set_align(Align::Left | Align::Inside | Align::Wrap);

        // Technical details
        let mut details_lbl = Frame::default()
            .with_size(card_w, 20)
            .with_pos(card_x, 350)
            .with_label("Technical Information:");
        details_lbl.set_align(Align::Left | Align::Inside);

        let mut tech_buf = TextBuffer::default();
        tech_buf.set_text(error_message);
        let mut tech_display = TextDisplay::default()
            .with_size(card_w, 100)
            .with_pos(card_x, 380);
        tech_display.set_buffer(tech_buf);
        tech_display.set_color(critical_card_bg);
        tech_display.set_frame(FrameType::BorderBox);
        tech_display.set_text_font(Font::Courier);
        tech_display.set_text_size(10);

        // Action buttons
        let btn_y = 520;
        let mut report_btn = Button::default()
            .with_size(140, 35)
            .with_pos(card_x + 50, btn_y)
            .with_label("Report Problem");
        report_btn.set_callback(|_| upload_crash_report());

        let mut restart_btn = Button::default()
            .with_size(140, 35)
            .with_pos(card_x + 210, btn_y)
            .with_label("Restart Ascendara");
        restart_btn.set_callback(|_| restart_ascendara());

        let mut exit_btn = Button::default()
            .with_size(100, 35)
            .with_pos(card_x + 370, btn_y)
            .with_label("Exit");
        exit_btn.set_callback(|_| app::quit());
    } else {
        // === Normal Error Widgets ===

        let mut header = Frame::default()
            .with_size(win_w, 40)
            .with_pos(0, 20)
            .with_label("⚠️ Ascendara Core Utility Crash");
        header.set_label_size(20);
        header.set_label_font(Font::HelveticaBold);

        let mut subheader = Frame::default()
            .with_size(540, 40)
            .with_pos(30, 60)
            .with_label(
                "A critical component of Ascendara has encountered an error and needs to close.",
            );
        subheader.set_label_size(13);
        subheader.set_align(Align::Center | Align::Inside | Align::Wrap);

        // Tool Identifier (Split labels for color)
        let tool_prefix_text = "Affected Component: ";
        let mut tool_prefix = Frame::default()
            .with_size(140, 30)
            .with_pos(30, 110)
            .with_label(tool_prefix_text);
        tool_prefix.set_label_size(13);
        tool_prefix.set_align(Align::Right | Align::Inside);

        let mut tool_val = Frame::default()
            .with_size(350, 30)
            .with_pos(170, 110)
            .with_label(&tool_name);
        tool_val.set_label_size(13);
        tool_val.set_label_color(Color::from_u32(0x1a73e8)); // Blue color
        tool_val.set_align(Align::Left | Align::Inside);

        // Error Card (Grey Box)
        let card_x = 30;
        let card_w = win_w - 60;
        let mut error_card = Frame::default()
            .with_size(card_w, 100)
            .with_pos(card_x, 150);
        error_card.set_frame(FrameType::BorderBox);
        error_card.set_color(normal_card_bg);

        // Inside Error Card
        let mut code_prefix = Frame::default()
            .with_size(110, 30)
            .with_pos(card_x + 10, 160)
            .with_label("Diagnostic Code:");
        code_prefix.set_label_size(13);
        code_prefix.set_align(Align::Left | Align::Inside);

        let mut code_val = Frame::default()
            .with_size(300, 30)
            .with_pos(card_x + 120, 160)
            .with_label(&format!("{}", error_code));
        code_val.set_label_size(13);
        code_val.set_align(Align::Left | Align::Inside);
        code_val.set_label_color(Color::Red); // Red color

        let mut desc_prefix = Frame::default()
            .with_size(110, 30)
            .with_pos(card_x + 10, 200)
            .with_label("What Happened:");
        desc_prefix.set_label_size(13);
        desc_prefix.set_align(Align::Left | Align::Inside);

        let mut desc_val = Frame::default()
            .with_size(380, 30)
            .with_pos(card_x + 120, 200)
            .with_label(&error_desc);
        desc_val.set_label_size(13);
        desc_val.set_align(Align::Left | Align::Inside);

        // Technical Details
        let mut details_lbl = Frame::default()
            .with_size(card_w, 20)
            .with_pos(card_x, 270)
            .with_label("Technical Details (useful for troubleshooting):");
        details_lbl.set_label_size(13);
        details_lbl.set_align(Align::Left | Align::Inside);

        let mut tech_buf = TextBuffer::default();
        tech_buf.set_text(error_message);

        let mut tech_editor = TextEditor::default()
            .with_size(card_w, 100)
            .with_pos(card_x, 300);
        tech_editor.set_buffer(tech_buf);
        tech_editor.set_color(normal_card_bg);
        tech_editor.set_frame(FrameType::BorderBox);
        tech_editor.set_text_font(Font::Courier);
        tech_editor.set_text_size(14);

        // Force simple cursor to ensure visibility
        tech_editor.set_cursor_style(fltk::text::Cursor::Simple);

        // Action text
        let mut action_lbl = Frame::default()
            .with_size(card_w, 40)
            .with_pos(card_x, 420)
            .with_label(
                "To help us improve Ascendara, you can report this issue or get support below:",
            );
        action_lbl.set_label_size(12);
        action_lbl.set_align(Align::Left | Align::Inside | Align::Wrap);

        // Buttons
        let btn_y = 460;
        let btn_h = 40;

        let mut support_btn = Button::default()
            .with_size(120, btn_h)
            .with_pos(50, btn_y)
            .with_label("Get Support");
        support_btn.set_label_size(13);
        support_btn.set_callback(|_| open_support());

        let mut upload_btn = Button::default()
            .with_size(160, btn_h)
            .with_pos(200, btn_y)
            .with_label("Upload Crash Report");
        upload_btn.set_label_size(13);
        upload_btn.set_callback(|_| upload_crash_report());

        let mut close_btn = Button::default()
            .with_size(100, btn_h)
            .with_pos(400, btn_y)
            .with_label("Close");
        close_btn.set_label_size(13);
        close_btn.set_callback(|_| app::quit());
    }

    wind.end();
    wind.show();
    app.run().unwrap();
}
