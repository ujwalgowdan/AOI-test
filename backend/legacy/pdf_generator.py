from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from datetime import datetime
from xml.sax.saxutils import escape
import os
import config

def get_downloads_folder():
    """Get the user's Downloads folder path"""
    home = os.path.expanduser("~")
    downloads = os.path.join(home, "Downloads")
    
    # Create Downloads folder if it doesn't exist
    if not os.path.exists(downloads):
        downloads = home
    
    return downloads

def create_innotech_logo(logo_path=None, width=120, height=60):
    """
    Create or use Innotech Integration logo
    Returns Image object or None
    """
    # Try multiple possible logo paths
    possible_paths = [
        logo_path,
        os.path.join(config.BASE_DIR, "innotech_logo.png"),
        os.path.join(config.BASE_DIR, "company_logo.png"),
        os.path.join(config.BASE_DIR, "logo.png")
    ]
    
    for path in possible_paths:
        if path and os.path.exists(path):
            try:
                return Image(path, width=width, height=height)
            except:
                continue
    
    return None

def create_digibull_logo(logo_path, width=80, height=40):
    """
    Create or use DigiBull.ai logo for footer
    Returns Image object or None
    """
    if os.path.exists(logo_path):
        return Image(logo_path, width=width, height=height)
    return None

def _report_path(report_data, save_to_downloads):
    """File name (with timestamp) and target folder for the daily report."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pdf_filename = f"Daily_Report_{report_data['date']}_{timestamp}.pdf"

    if save_to_downloads:
        downloads_folder = get_downloads_folder()
        return os.path.join(downloads_folder, pdf_filename)
    return os.path.join(config.REPORTS_DIR, pdf_filename)


def _report_styles():
    """Sample stylesheet plus the title, heading and normal paragraph styles."""
    styles = getSampleStyleSheet()

    # Custom title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#1f77b4'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )

    # Custom heading style
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.black,
        spaceAfter=12,
        spaceBefore=12,
        fontName='Helvetica-Bold'
    )

    # Normal text style
    normal_style = ParagraphStyle(
        'CustomNormal',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.black,
        spaceAfter=6
    )
    return styles, title_style, heading_style, normal_style


def _header_elements(report_data, title_style, heading_style, normal_style):
    """Logo, title, date/time, machine summary, operator and inspector."""
    elements = []

    # === LOGO ===
    logo = create_innotech_logo()
    if logo:
        elements.append(logo)
        elements.append(Spacer(1, 0.2*inch))

    # === TITLE ===
    title = Paragraph("Daily Output Cable Wire Interchange Test Report", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.3*inch))

    # Values below are user/config data, not markup: escape &, < and > so
    # ReportLab shows them literally (only the labels carry <b>).

    # === DATE AND TIME ===
    date_text = Paragraph(f"<b>Date:</b> {escape(str(report_data['date']))}", normal_style)
    elements.append(date_text)

    time_text = Paragraph(f"<b>Time:</b> {escape(str(report_data['time']))}", normal_style)
    elements.append(time_text)
    elements.append(Spacer(1, 0.2*inch))

    # === DAILY SUMMARY ===
    machine_name = config.MACHINE_NAME
    summary_text = Paragraph(f"<b>DAILY SUMMARY</b>- Machine: {escape(str(machine_name))}", heading_style)
    elements.append(summary_text)

    operator_text = Paragraph(
        f"<b>Operator:</b> {escape(str(report_data['employee_name']))} "
        f"(ID: {escape(str(report_data['employee_id']))})",
        normal_style
    )
    elements.append(operator_text)

    inspector_text = Paragraph(
        f"<b>First Piece Inspection:</b> {escape(str(report_data.get('inspector_name', 'N/A')))}",
        normal_style
    )
    elements.append(inspector_text)
    elements.append(Spacer(1, 0.3*inch))
    return elements


def _result_rows(report_data):
    """Header row, one row per test (or the counts-only fallback), Total row."""
    table_data = [
        ['Serial No', 'Count', 'Pass', 'Fail', 'Cumulative %']
    ]

    # Add test results
    tests = report_data.get('tests', [])
    if tests:
        for test in tests:
            serial_no = test.get('serial_no', '')
            result = test.get('result', '')
            cumulative_rate = test.get('cumulative_pass_rate', 100)

            if result == "Pass":
                pass_val = "Yes"
                fail_val = "-"
            else:
                pass_val = "-"
                fail_val = "Yes"

            table_data.append([
                str(serial_no),
                '1',
                pass_val,
                fail_val,
                str(int(cumulative_rate))
            ])
    else:
        # If no tests in data, use the summary counts
        pass_count = report_data.get('ok_count', 0)
        fail_count = report_data.get('not_ok_count', 0)
        total = pass_count + fail_count

        for i in range(total):
            serial_no = i + 1
            if i < pass_count:
                pass_val = "Yes"
                fail_val = "-"
            else:
                pass_val = "-"
                fail_val = "Yes"

            cumulative_pass = int((min(i + 1, pass_count) / (i + 1)) * 100)

            table_data.append([
                str(serial_no),
                '1',
                pass_val,
                fail_val,
                str(cumulative_pass)
            ])

    # Add total row
    total_count = report_data.get('total_tested', 0)
    pass_count = report_data.get('ok_count', 0)
    fail_count = report_data.get('not_ok_count', 0)
    final_rate = int((pass_count / total_count * 100) if total_count > 0 else 100)

    table_data.append([
        'Total',
        str(total_count),
        str(pass_count),
        str(fail_count),
        str(final_rate)
    ])
    return table_data


def _result_table(table_data):
    """The results table with its grid, header/total styling and Pass/Fail colours."""
    table = Table(table_data, colWidths=[1.2*inch, 1*inch, 1*inch, 1*inch, 1.5*inch])

    # Table style
    table_style = TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),

        # Data rows
        ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -2), 10),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),

        # Grid
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BOX', (0, 0), (-1, -1), 2, colors.black),

        # Total row
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f0f0')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, -1), (-1, -1), 11),
    ])

    # Add green background for "Yes" in Pass column and red for Fail
    for i in range(1, len(table_data) - 1):  # Exclude header and total
        # Pass column (index 2)
        if table_data[i][2] == "Yes":
            table_style.add('BACKGROUND', (2, i), (2, i), colors.HexColor('#90EE90'))

        # Fail column (index 3)
        if table_data[i][3] == "Yes":
            table_style.add('BACKGROUND', (3, i), (3, i), colors.HexColor('#FF6B6B'))

    table.setStyle(table_style)
    return table


def _footer_elements(styles):
    """'Powered by' plus the DigiBull.ai logo, or its text fallback."""
    elements = [Spacer(1, 0.3*inch)]

    powered_by_style = ParagraphStyle(
        'PoweredBy',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.grey,
        alignment=TA_CENTER,
        spaceAfter=6
    )

    powered_text = Paragraph("<b>Powered by</b>", powered_by_style)
    elements.append(powered_text)

    # DigiBull.ai logo (if available)
    digibull_logo_path = os.path.join(config.BASE_DIR, "digibull_logo.png")
    digibull_logo = create_digibull_logo(digibull_logo_path)
    if digibull_logo:
        elements.append(digibull_logo)
    else:
        # If no logo, just show text
        digibull_style = ParagraphStyle(
            'DigiBull',
            parent=styles['Normal'],
            fontSize=16,
            textColor=colors.HexColor('#FF8C00'),
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        digibull_text = Paragraph("Digi<font color='#1E90FF'>Bull</font>.ai", digibull_style)
        elements.append(digibull_text)
    return elements


def generate_report_pdf(report_data, save_to_downloads=False):
    """
    Generate PDF report matching the Innotech sample format

    Args:
        report_data (dict): Dictionary containing:
            - date: Date string
            - time: Time string
            - employee_name: Operator name
            - employee_id: Operator ID
            - inspector_name: First piece inspector name
            - tests: List of test dictionaries with serial_no, result, cumulative_pass_rate
            - total_tested: Total count
            - ok_count: Pass count
            - not_ok_count: Fail count
            - start_time: Session start time
            - end_time: Session end time
        save_to_downloads (bool): If True, save to Downloads folder instead of reports folder

    Returns:
        str: Path to generated PDF file
    """
    pdf_path = _report_path(report_data, save_to_downloads)

    # Create PDF document
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=50
    )

    styles, title_style, heading_style, normal_style = _report_styles()
    elements = _header_elements(report_data, title_style, heading_style, normal_style)

    # === DAILY TEST RESULT SUMMARY TABLE ===
    result_heading = Paragraph("<b>Daily Test Result Summary</b>", heading_style)
    elements.append(result_heading)
    elements.append(Spacer(1, 0.1*inch))
    elements.append(_result_table(_result_rows(report_data)))
    elements.append(Spacer(1, 0.5*inch))

    # === FOOTER - Powered by ===
    elements.extend(_footer_elements(styles))

    # Build PDF
    doc.build(elements)

    print(f"PDF report generated: {pdf_path}")
    return pdf_path


def generate_session_report_pdf(report_data):
    """
    Generate session-specific PDF report (for individual test sessions)
    This is different from daily report
    """
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pdf_filename = f"Session_Report_{report_data['employee_name']}_{timestamp}.pdf"
    pdf_path = os.path.join(config.REPORTS_DIR, pdf_filename)
    
    doc = SimpleDocTemplate(pdf_path, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Title'],
        fontSize=20,
        textColor=colors.HexColor('#1f77b4'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    title = Paragraph("Testing Session Report", title_style)
    elements.append(title)
    elements.append(Spacer(1, 0.3*inch))
    
    # Session Info
    info_data = [
        ['Date:', report_data['date']],
        ['Operator:', f"{report_data['employee_name']} (ID: {report_data['employee_id']})"],
        ['Inspector:', report_data.get('inspector_name', 'N/A')],
        ['Start Time:', report_data['start_time']],
        ['End Time:', report_data['end_time']],
        ['Duration:', f"{report_data.get('duration', 'N/A')}"]
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
    ]))
    
    elements.append(info_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Results Summary
    results_data = [
        ['Metric', 'Count', 'Percentage'],
        ['Total Tested', str(report_data['total_tested']), '100%'],
        ['OK', str(report_data['ok_count']), 
         f"{(report_data['ok_count']/report_data['total_tested']*100):.1f}%" if report_data['total_tested'] > 0 else "0%"],
        ['NOT OK', str(report_data['not_ok_count']), 
         f"{(report_data['not_ok_count']/report_data['total_tested']*100):.1f}%" if report_data['total_tested'] > 0 else "0%"]
    ]
    
    results_table = Table(results_data, colWidths=[2*inch, 2*inch, 2*inch])
    results_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f77b4')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('BACKGROUND', (0, 2), (-1, 2), colors.lightgreen),
        ('BACKGROUND', (0, 3), (-1, 3), colors.lightcoral),
    ]))
    
    elements.append(results_table)
    
    # Build PDF
    doc.build(elements)
    
    print(f"Session PDF report generated: {pdf_path}")
    return pdf_path
