import os
import sys
from dotenv import load_dotenv

# Ensure stdout can handle non-ASCII (e.g. emoji) on Windows cp1252 consoles
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Load environment variables from .env file
load_dotenv()

# ========== FILE PATHS ==========
BASE_DIR = os.getcwd()
EXCEL_LOG = os.path.join(BASE_DIR, "detection_results.xlsx")
EMPLOYEE_DB = os.path.join(BASE_DIR, "employees.json")
INSPECTOR_DB = os.path.join(BASE_DIR, "inspectors.json")  # NEW: For first piece inspectors
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
DAILY_LOG_FILE = os.path.join(BASE_DIR, "daily_test_log.json")  # NEW: Track daily tests

# Create directories if they don't exist
os.makedirs(REPORTS_DIR, exist_ok=True)

# ========== ADMIN CREDENTIALS ==========
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()  # No default: weak/missing disables admin routes (503)
WEAK_ADMIN_PASSWORDS = {"", "admin123", "change-me-please"}

# ========== EMAIL CONFIGURATION ==========
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "thorathharish@gmail.com")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "your_app_password")

# Recipient emails (comma-separated in .env file)
RECIPIENT_EMAILS_STR = os.getenv("RECIPIENT_EMAILS", "supervisor@company.com,manager@company.com")
RECIPIENT_EMAILS = [email.strip() for email in RECIPIENT_EMAILS_STR.split(",")]

# ========== DAILY REPORT SETTINGS ==========
DAILY_REPORT_TIME = "20:00"  # 8:00 PM in 24-hour format
AUTO_SEND_DAILY_REPORT = True  # Enable/disable automatic daily report

# ========== COMPANY/MACHINE INFORMATION ==========
COMPANY_NAME = os.getenv("COMPANY_NAME", "Innotech Integration")
MACHINE_NAME = os.getenv("MACHINE_NAME", "AOI Tester – M03")
COMPANY_LOGO_PATH = os.path.join(BASE_DIR, "company_logo.png")  # Optional logo

# ========== DETECTION PARAMETERS ==========
# These can be adjusted based on your specific requirements
EXPECTED_WIRE_ORDER = ["yellow", "green"]  # Top to bottom in image (camera rotated 90°): yellow-top/green-bottom == yellow-left/green-right == OK
DARK_THRESHOLD = 60
MIN_CONNECTOR_AREA = 2000
CONNECTOR_EXPAND_PIXELS = 12
MIN_COLOR_AREA = 60
STABILITY_FRAMES = 5
COUNT_DELAY_SECONDS = 4.0

# ========== COLOR RANGES (HSV) ==========
# Single source: app/services/detector_core.COLOR_RANGES (the only copy the
# detector reads). The duplicate that used to live here was never read.

# ========== APPLICATION SETTINGS ==========
APP_TITLE = "Automated Optical Inspection"
AUTO_REFRESH_INTERVAL = 2  # seconds (while detection is running)

# ========== PDF REPORT SETTINGS ==========
REPORT_COMPANY_LOGO = None  # Path to company logo (optional)
REPORT_PASS_THRESHOLD = 95.0  # Percentage for "EXCELLENT" status

# ========== VALIDATION ==========
def validate_config():
    """Validate configuration settings"""
    issues = []
    
    if SENDER_EMAIL == "your_email@gmail.com":
        issues.append("⚠️ Email not configured. Update SENDER_EMAIL in .env file")
    
    if SENDER_PASSWORD == "your_app_password":
        issues.append("⚠️ Email password not configured. Update SENDER_PASSWORD in .env file")
    
    if "your_email" in RECIPIENT_EMAILS_STR or "supervisor" in RECIPIENT_EMAILS_STR:
        issues.append("⚠️ Recipient emails not configured. Update RECIPIENT_EMAILS in .env file")
    
    if ADMIN_PASSWORD in WEAK_ADMIN_PASSWORDS:
        issues.append(
            "⚠️ ADMIN_PASSWORD is missing or a placeholder — admin routes are DISABLED (503) "
            "until a strong value is set in .env"
        )
    
    return issues

# Print configuration warnings on import
if __name__ != "__main__":
    warnings = validate_config()
    if warnings:
        print("\n" + "="*60)
        print("CONFIGURATION WARNINGS:")
        for warning in warnings:
            print(f"  {warning}")
        print("="*60 + "\n")
