import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
import os
import config

def send_email_report(pdf_path, report_data):
    """
    Send session PDF report via email to higher-ups
    
    Args:
        pdf_path (str): Path to PDF file
        report_data (dict): Report data for email body
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    
    try:
        # Email configuration
        sender_email = config.SENDER_EMAIL
        sender_password = config.SENDER_PASSWORD
        recipient_emails = config.RECIPIENT_EMAILS
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = ', '.join(recipient_emails)
        msg['Subject'] = f"Testing Session Report - {report_data['employee_name']} - {report_data['date']}"
        
        # Email body
        body = f"""
        <html>
            <head>
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }}
                    .header {{
                        background-color: #1f77b4;
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }}
                    .content {{
                        padding: 20px;
                    }}
                    .summary {{
                        background-color: #f4f4f4;
                        border-left: 4px solid #1f77b4;
                        padding: 15px;
                        margin: 20px 0;
                    }}
                    .result-ok {{
                        color: #28a745;
                        font-weight: bold;
                    }}
                    .result-notok {{
                        color: #dc3545;
                        font-weight: bold;
                    }}
                    .footer {{
                        text-align: center;
                        padding: 20px;
                        font-size: 12px;
                        color: #777;
                    }}
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Wire Connector Testing Session Report</h1>
                </div>
                
                <div class="content">
                    <h2>Session Summary</h2>
                    
                    <div class="summary">
                        <p><strong>Operator:</strong> {report_data['employee_name']} (ID: {report_data['employee_id']})</p>
                        <p><strong>Inspector:</strong> {report_data.get('inspector_name', 'N/A')}</p>
                        <p><strong>Date:</strong> {report_data['date']}</p>
                        <p><strong>Session Duration:</strong> {report_data['start_time']} - {report_data['end_time']}</p>
                    </div>
                    
                    <h2>Results</h2>
                    <ul>
                        <li><strong>Total Tested:</strong> {report_data['total_tested']}</li>
                        <li class="result-ok"><strong>OK:</strong> {report_data['ok_count']} ({report_data['ok_count']/report_data['total_tested']*100:.1f}%)</li>
                        <li class="result-notok"><strong>NOT OK:</strong> {report_data['not_ok_count']} ({report_data['not_ok_count']/report_data['total_tested']*100:.1f}%)</li>
                    </ul>
                    
                    <p>Please find the detailed PDF report attached to this email.</p>
                </div>
                
                <div class="footer">
                    <p>This is an automated email from the Wire Connector Testing System</p>
                    <p>Generated at {report_data['date']} {report_data['time']}</p>
                </div>
            </body>
        </html>
        """
        
        # Attach body
        msg.attach(MIMEText(body, 'html'))
        
        # Attach PDF file
        if os.path.exists(pdf_path):
            with open(pdf_path, 'rb') as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            
            filename = os.path.basename(pdf_path)
            part.add_header(
                'Content-Disposition',
                f'attachment; filename= {filename}'
            )
            
            msg.attach(part)
        else:
            print(f"Warning: PDF file not found at {pdf_path}")
            return False
        
        # Send email
        print("Connecting to email server...")
        
        # Use Gmail SMTP server (modify for other email providers)
        if 'gmail' in sender_email.lower():
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        elif 'outlook' in sender_email.lower() or 'hotmail' in sender_email.lower():
            smtp_server = 'smtp-mail.outlook.com'
            smtp_port = 587
        elif 'yahoo' in sender_email.lower():
            smtp_server = 'smtp.mail.yahoo.com'
            smtp_port = 587
        else:
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        
        print("Logging in to email account...")
        server.login(sender_email, sender_password)
        
        print("Sending email...")
        text = msg.as_string()
        server.sendmail(sender_email, recipient_emails, text)
        server.quit()
        
        print(f"Email sent successfully to {', '.join(recipient_emails)}")
        return True
        
    except Exception as e:
        print(f"Failed to send email: {e}")
        print("\nTroubleshooting tips:")
        print("1. Check your email and password in .env file")
        print("2. For Gmail: Enable 'App Passwords' in Google Account settings")
        print("3. For Outlook: Enable 'Less secure app access'")
        print("4. Check your internet connection")
        return False


def send_daily_report(pdf_path, report_data):
    """
    Send daily summary report via email
    
    Args:
        pdf_path (str): Path to daily report PDF file
        report_data (dict): Daily report data
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    
    try:
        # Email configuration
        sender_email = config.SENDER_EMAIL
        sender_password = config.SENDER_PASSWORD
        recipient_emails = config.RECIPIENT_EMAILS
        
        # Create message
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = ', '.join(recipient_emails)
        msg['Subject'] = f"Daily Output Cable Wire Test Report - {report_data['date']}"
        
        # Calculate pass rate
        total = report_data.get('total_tested', 0)
        pass_count = report_data.get('ok_count', 0)
        fail_count = report_data.get('not_ok_count', 0)
        pass_rate = (pass_count / total * 100) if total > 0 else 0
        
        # Email body
        body = f"""
        <html>
            <head>
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                    }}
                    .header {{
                        background-color: #1f77b4;
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }}
                    .content {{
                        padding: 20px;
                    }}
                    .summary {{
                        background-color: #f4f4f4;
                        border-left: 4px solid #1f77b4;
                        padding: 15px;
                        margin: 20px 0;
                    }}
                    .metrics {{
                        display: flex;
                        justify-content: space-around;
                        margin: 20px 0;
                    }}
                    .metric-box {{
                        background-color: #f8f9fa;
                        border: 2px solid #dee2e6;
                        border-radius: 5px;
                        padding: 15px;
                        text-align: center;
                        min-width: 120px;
                    }}
                    .metric-value {{
                        font-size: 24px;
                        font-weight: bold;
                        color: #1f77b4;
                    }}
                    .metric-label {{
                        font-size: 14px;
                        color: #6c757d;
                        margin-top: 5px;
                    }}
                    .result-ok {{
                        color: #28a745;
                        font-weight: bold;
                    }}
                    .result-notok {{
                        color: #dc3545;
                        font-weight: bold;
                    }}
                    .footer {{
                        text-align: center;
                        padding: 20px;
                        font-size: 12px;
                        color: #777;
                    }}
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Daily Output Cable Wire Interchange Test Report</h1>
                    <p>{report_data['date']}</p>
                </div>
                
                <div class="content">
                    <h2>Daily Summary</h2>
                    
                    <div class="summary">
                        <p><strong>Machine:</strong> {config.MACHINE_NAME}</p>
                        <p><strong>Operator:</strong> {report_data['employee_name']} (ID: {report_data['employee_id']})</p>
                        <p><strong>First Piece Inspection:</strong> {report_data.get('inspector_name', 'N/A')}</p>
                        <p><strong>Report Time:</strong> {report_data['time']}</p>
                    </div>
                    
                    <h2>Test Results</h2>
                    
                    <div class="metrics">
                        <div class="metric-box">
                            <div class="metric-value">{total}</div>
                            <div class="metric-label">Total Tests</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-value result-ok">{pass_count}</div>
                            <div class="metric-label">Pass</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-value result-notok">{fail_count}</div>
                            <div class="metric-label">Fail</div>
                        </div>
                        <div class="metric-box">
                            <div class="metric-value">{pass_rate:.0f}%</div>
                            <div class="metric-label">Pass Rate</div>
                        </div>
                    </div>
                    
                    <p>Please find the detailed daily report attached to this email with complete test-by-test breakdown.</p>
                </div>
                
                <div class="footer">
                    <p>This is an automated daily report from the Wire Connector Testing System</p>
                    <p>Generated at {report_data['date']} {report_data['time']}</p>
                    <p>{config.COMPANY_NAME}</p>
                </div>
            </body>
        </html>
        """
        
        # Attach body
        msg.attach(MIMEText(body, 'html'))
        
        # Attach PDF file
        if os.path.exists(pdf_path):
            with open(pdf_path, 'rb') as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
            
            encoders.encode_base64(part)
            
            filename = os.path.basename(pdf_path)
            part.add_header(
                'Content-Disposition',
                f'attachment; filename= {filename}'
            )
            
            msg.attach(part)
        else:
            print(f"Warning: PDF file not found at {pdf_path}")
            return False
        
        # Send email
        print("Connecting to email server for daily report...")
        
        if 'gmail' in sender_email.lower():
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        elif 'outlook' in sender_email.lower() or 'hotmail' in sender_email.lower():
            smtp_server = 'smtp-mail.outlook.com'
            smtp_port = 587
        elif 'yahoo' in sender_email.lower():
            smtp_server = 'smtp.mail.yahoo.com'
            smtp_port = 587
        else:
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        
        print("Logging in to email account...")
        server.login(sender_email, sender_password)
        
        print("Sending daily report email...")
        text = msg.as_string()
        server.sendmail(sender_email, recipient_emails, text)
        server.quit()
        
        print(f"Daily report email sent successfully to {', '.join(recipient_emails)}")
        return True
        
    except Exception as e:
        print(f"Failed to send daily report email: {e}")
        return False


def test_email_connection():
    """
    Test email configuration without sending a report
    Returns True if connection successful
    """
    try:
        sender_email = config.SENDER_EMAIL
        sender_password = config.SENDER_PASSWORD
        
        if 'gmail' in sender_email.lower():
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        else:
            smtp_server = 'smtp.gmail.com'
            smtp_port = 587
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(sender_email, sender_password)
        server.quit()
        
        print("✅ Email connection successful!")
        return True
        
    except Exception as e:
        print(f"❌ Email connection failed: {e}")
        return False
