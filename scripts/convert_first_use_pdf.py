from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph as RLParagraph, Spacer, Table as RLTable, TableStyle, KeepTogether
from reportlab.lib.colors import HexColor
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'docs' / 'SmartPages-配置与首次使用.docx'
OUT = ROOT / 'docs' / 'SmartPages-配置与首次使用.pdf'
FONT = r'C:\Windows\Fonts\msyh.ttc'


def iter_blocks(parent):
    parent_elm = parent.element.body
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('MSYH', 8)
    canvas.setFillColor(HexColor('#6B7280'))
    canvas.drawRightString(letter[0] - inch, 0.55 * inch, f'SmartPages 配置与首次使用  |  {doc.page}')
    canvas.restoreState()


def cell_text(cell):
    return '<br/>'.join(escape(p.text).replace('\n', '<br/>') for p in cell.paragraphs if p.text) or '&nbsp;'


def build():
    pdfmetrics.registerFont(TTFont('MSYH', FONT, subfontIndex=0))
    styles = getSampleStyleSheet()
    base = dict(fontName='MSYH', fontSize=10.5, leading=16, textColor=HexColor('#1F2937'))
    body = ParagraphStyle('BodyCN', parent=styles['BodyText'], spaceAfter=7, **base)
    bullet = ParagraphStyle('BulletCN', parent=body, leftIndent=18, firstLineIndent=-12, bulletIndent=0, spaceAfter=4)
    number = ParagraphStyle('NumberCN', parent=body, leftIndent=22, firstLineIndent=-14, bulletIndent=0, spaceAfter=4)
    h1 = ParagraphStyle('H1CN', parent=styles['Heading1'], fontName='MSYH', fontSize=16, leading=23, textColor=HexColor('#2E74B5'), spaceBefore=18, spaceAfter=9, keepWithNext=1)
    h2 = ParagraphStyle('H2CN', parent=styles['Heading2'], fontName='MSYH', fontSize=13, leading=19, textColor=HexColor('#2E74B5'), spaceBefore=13, spaceAfter=6, keepWithNext=1)
    title = ParagraphStyle('TitleCN', parent=styles['Title'], fontName='MSYH', fontSize=24, leading=30, textColor=HexColor('#1F4D78'), alignment=TA_CENTER, spaceAfter=4)
    subtitle = ParagraphStyle('SubtitleCN', parent=body, fontSize=12, leading=18, textColor=HexColor('#5B6472'), alignment=TA_CENTER, spaceAfter=16)
    table_body = ParagraphStyle('TableBodyCN', parent=body, fontSize=8.8, leading=13, spaceAfter=0)
    table_header = ParagraphStyle('TableHeaderCN', parent=table_body, textColor=HexColor('#1F4D78'))
    docx = Document(SRC)
    story = []
    list_index = 0
    for block in iter_blocks(docx):
        if isinstance(block, Paragraph):
            text = block.text.strip()
            if not text:
                continue
            safe = escape(text).replace('\n', '<br/>')
            name = block.style.name
            if name == 'Heading 1':
                story.append(RLParagraph(safe, h1))
            elif name == 'Heading 2':
                story.append(RLParagraph(safe, h2))
            elif name == 'List Bullet':
                story.append(RLParagraph(safe, bullet, bulletText='•'))
            elif name == 'List Number':
                list_index += 1
                story.append(RLParagraph(safe, number, bulletText=f'{list_index}.'))
            else:
                list_index = 0
                if text == 'SmartPages 配置与首次使用':
                    story.append(RLParagraph(safe, title))
                elif text == '从安装、模型配置到首次生成文档':
                    story.append(RLParagraph(safe, subtitle))
                else:
                    story.append(RLParagraph(safe, body))
        else:
            data = []
            for row_i, row in enumerate(block.rows):
                cells = []
                for cell in row.cells:
                    style = table_header if row_i == 0 else table_body
                    cells.append(RLParagraph(cell_text(cell), style))
                data.append(cells)
            widths = [cell.width.inches * inch if cell.width else None for cell in block.rows[0].cells]
            if not all(widths):
                widths = None
            table = RLTable(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
            ts = [
                ('FONTNAME', (0, 0), (-1, -1), 'MSYH'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('GRID', (0, 0), (-1, -1), 0.35, HexColor('#C7D2E0')),
                ('BACKGROUND', (0, 0), (-1, 0), HexColor('#E8EEF5')),
            ]
            if len(block.rows) == 1 and len(block.rows[0].cells) == 1:
                ts += [('BACKGROUND', (0, 0), (-1, -1), HexColor('#F4F6F9'))]
            table.setStyle(TableStyle(ts))
            story.append(Spacer(1, 4))
            story.append(table)
            story.append(Spacer(1, 8))
    pdf = SimpleDocTemplate(str(OUT), pagesize=letter, leftMargin=inch, rightMargin=inch, topMargin=inch, bottomMargin=0.8 * inch, title='SmartPages 配置与首次使用', author='SmartPages')
    pdf.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUT)


if __name__ == '__main__':
    build()
