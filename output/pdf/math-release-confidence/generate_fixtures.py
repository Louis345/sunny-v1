from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
PAGE_W, PAGE_H = letter


def register_fonts() -> tuple[str, str, str]:
    candidates = [
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("SunnySans", regular))
            pdfmetrics.registerFont(TTFont("SunnySansBold", bold))
            return "SunnySans", "SunnySansBold", "Helvetica-Oblique"
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


REGULAR, BOLD, ITALIC = register_fonts()


ASSIGNMENTS = [
    {
        "slug": "round-1-equal-groups",
        "code": "LAB-MATH-A",
        "title": "Lantern Market Arrays",
        "subtitle": "Equal groups, arrays, and multiplication facts",
        "items": [
            ("1", "Draw 3 equal groups with 4 lanterns in each group.", "drawing", "3 groups of 4; total 12", True),
            ("2", "A display has 4 rows of 5 lanterns. How many lanterns are there?", "blank", "20", True),
            ("3", "Write a multiplication equation for 2 + 2 + 2 + 2.", "blank", "4 x 2 = 8", True),
            ("4", "Circle the array that shows 3 x 4.", "arrays", "B", True),
            ("5", "Five baskets hold 3 oranges each. How many oranges are there?", "blank", "8", False),
            ("6", "Explain why 3 x 4 and 4 x 3 have the same total.", "lines", "Both make 12; rows and columns switch.", True),
        ],
        "score": "5 / 6",
        "teacher_note": "Strong arrays and facts. Recheck how the story tells which operation to use.",
    },
    {
        "slug": "round-2-missing-factor",
        "code": "LAB-MATH-B",
        "title": "Garden Row Mysteries",
        "subtitle": "Missing factors and interpreting multiplication situations",
        "items": [
            ("1", "There are 24 flowers in 6 equal rows. How many flowers are in each row?", "blank", "18", False),
            ("2", "Fill in the missing number: 4 x ___ = 28.", "blank", "24", False),
            ("3", "Which equation matches 5 trays with 6 seedlings each?  A. 5 + 6 = 11   B. 5 x 6 = 30   C. 6 - 5 = 1", "choices", "B", True),
            ("4", "Draw an array for 3 x 7 and write the total.", "drawing", "3 by 7; total 21", True),
            ("5", "A gardener packs 32 bulbs equally into 4 boxes. How many go in each box?", "blank", "28", False),
            ("6", "Complete both equations: 6 x 5 = ___ and 30 = ___ x 5.", "double", "30 and 6", True),
            ("7", "Mia says 7 x 4 means 7 + 4. Explain the mistake.", "lines", "It means 7 equal groups of 4, not one addition.", True),
        ],
        "score": "4 / 7",
        "teacher_note": "Direct facts are improving. Missing factors and equal-sharing stories still need support.",
    },
    {
        "slug": "round-3-transfer",
        "code": "LAB-MATH-C",
        "title": "Festival Team Challenge",
        "subtitle": "Independent transfer across facts, arrays, and word problems",
        "items": [
            ("1", "A festival makes 7 teams with 6 children on each team. How many children?", "blank", "42", True),
            ("2", "Forty flags are placed in 5 equal rows. How many flags are in each row?", "blank", "8", True),
            ("3", "Fill in the missing factor: ___ x 8 = 48.", "blank", "6", True),
            ("4", "Write two multiplication equations represented by a 4-by-9 array.", "double", "4 x 9 = 36 and 9 x 4 = 36", True),
            ("5", "Three booths each need 8 cups in the morning and 8 cups later. How many cups total?", "blank", "48", True),
            ("6", "Which story uses 6 x 7?  A. 6 bags with 7 tokens each   B. 6 tokens plus 7 tokens   C. 7 tokens shared by 6", "choices", "A", True),
            ("7", "A child writes 5 x 9 = 40. Use a nearby fact to correct the answer.", "lines", "5 x 10 is 50, so 5 x 9 is 45.", True),
            ("8", "A stage has 36 lights. Draw two different equal-row arrays that use all 36.", "drawing", "6 by 6 only", False),
        ],
        "score": "7 / 8",
        "teacher_note": "Independent transfer is strong. Continue exploring multiple factor pairs for the same total.",
    },
]


def rounded_box(c, x, y, w, h, fill, stroke=colors.HexColor("#D7DFEA"), radius=10):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def wrap(c, text, x, y, max_width, font=REGULAR, size=10.5, leading=14):
    words = text.split()
    lines, line = [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if c.stringWidth(trial, font, size) <= max_width:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    c.setFont(font, size)
    c.setFillColor(colors.HexColor("#213047"))
    for row in lines:
        c.drawString(x, y, row)
        y -= leading
    return y


def draw_array_choices(c, x, y):
    choices = [(2, 6), (3, 4), (4, 3)]
    for idx, (rows, cols) in enumerate(choices):
        ox = x + idx * 145
        c.setFont(BOLD, 9)
        c.setFillColor(colors.HexColor("#52627A"))
        c.drawString(ox, y + 34, chr(65 + idx))
        for r in range(rows):
            for col in range(cols):
                c.setFillColor(colors.HexColor("#FFB84D"))
                c.circle(ox + 22 + col * 12, y + 25 - r * 10, 3.2, fill=1, stroke=0)


def draw_response_area(c, kind, x, y, w, marked_answer=None):
    c.setStrokeColor(colors.HexColor("#AEB8C8"))
    c.setLineWidth(1)
    if kind == "arrays":
        draw_array_choices(c, x, y - 4)
    elif kind == "choices":
        options = ["A", "B", "C"]
        for idx, label in enumerate(options):
            c.circle(x + 20 + idx * 74, y + 8, 10, fill=0, stroke=1)
            c.setFont(BOLD, 8)
            c.drawCentredString(x + 20 + idx * 74, y + 5, label)
    elif kind == "double":
        c.line(x, y, x + w * 0.44, y)
        c.line(x + w * 0.55, y, x + w, y)
    elif kind == "drawing":
        c.rect(x, y - 18, w, 34, fill=0, stroke=1)
    elif kind == "lines":
        c.line(x, y + 7, x + w, y + 7)
        c.line(x, y - 8, x + w, y - 8)
    else:
        c.line(x, y, x + w, y)
    if marked_answer:
        c.setFillColor(colors.HexColor("#235CC7"))
        c.setFont(ITALIC, 10.5)
        c.drawString(x + 8, y + 3, marked_answer)


def make_pdf(spec, returned=False):
    suffix = "returned-marked" if returned else "original"
    path = ROOT / f"{spec['slug']}-{suffix}.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"{spec['code']} - {spec['title']} - {suffix}")

    c.setFillColor(colors.HexColor("#F7FAFE"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#17233B"))
    c.rect(0, PAGE_H - 108, PAGE_W, 108, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#63D5C6"))
    c.rect(0, PAGE_H - 114, PAGE_W, 6, fill=1, stroke=0)

    c.setFont(BOLD, 10)
    c.setFillColor(colors.HexColor("#63D5C6"))
    c.drawString(42, PAGE_H - 33, f"SUNNY SYNTHETIC LAB FIXTURE  |  {spec['code']}")
    c.setFont(BOLD, 22)
    c.setFillColor(colors.white)
    c.drawString(42, PAGE_H - 62, spec["title"])
    c.setFont(REGULAR, 10.5)
    c.setFillColor(colors.HexColor("#D9E4F3"))
    c.drawString(42, PAGE_H - 82, spec["subtitle"])
    c.drawRightString(PAGE_W - 42, PAGE_H - 82, "Grade 3 mathematics")

    rounded_box(c, 42, PAGE_H - 154, PAGE_W - 84, 26, colors.white)
    c.setFont(REGULAR, 9.5)
    c.setFillColor(colors.HexColor("#52627A"))
    c.drawString(54, PAGE_H - 144, "Student: Synthetic Learner")
    c.drawString(258, PAGE_H - 144, "Date: 2026-08-08")
    c.drawString(420, PAGE_H - 144, f"Version: {'RETURNED' if returned else 'BLANK'}")

    top = PAGE_H - 176
    available = top - 76
    item_h = min(76, available / len(spec["items"]))
    for idx, (number, prompt, kind, answer, correct) in enumerate(spec["items"]):
        y = top - idx * item_h
        fill = colors.white if idx % 2 == 0 else colors.HexColor("#F1F6FC")
        rounded_box(c, 42, y - item_h + 5, PAGE_W - 84, item_h - 8, fill, radius=8)
        c.setFillColor(colors.HexColor("#2D7D78"))
        c.circle(61, y - 20, 12, fill=1, stroke=0)
        c.setFont(BOLD, 9)
        c.setFillColor(colors.white)
        c.drawCentredString(61, y - 23, number)
        prompt_end = wrap(c, prompt, 82, y - 15, PAGE_W - 145, size=9.5, leading=11)
        answer_text = answer if returned else None
        draw_response_area(c, kind, 84, min(prompt_end - 6, y - 39), PAGE_W - 170, answer_text)
        if returned:
            mark_color = colors.HexColor("#20A464") if correct else colors.HexColor("#D84242")
            c.setFillColor(mark_color)
            c.setFont(BOLD, 16)
            c.drawRightString(PAGE_W - 55, y - 24, "OK" if correct else "X")

    if returned:
        rounded_box(c, 42, 23, PAGE_W - 84, 44, colors.HexColor("#FFF5D8"), colors.HexColor("#E2B84B"), 8)
        c.setFillColor(colors.HexColor("#25324A"))
        c.setFont(BOLD, 11)
        c.drawString(54, 51, f"Teacher score: {spec['score']}")
        c.setFont(REGULAR, 8.5)
        c.drawString(54, 35, spec["teacher_note"])
    else:
        c.setFillColor(colors.HexColor("#6D7A8D"))
        c.setFont(ITALIC, 8.5)
        c.drawString(42, 39, "Show your thinking. This document is synthetic and contains no real child data.")

    c.setFont(REGULAR, 7.5)
    c.setFillColor(colors.HexColor("#8A95A6"))
    c.drawRightString(PAGE_W - 42, 13, f"{spec['code']} / {suffix}")
    c.save()
    return path


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    for assignment in ASSIGNMENTS:
        print(make_pdf(assignment, returned=False))
        print(make_pdf(assignment, returned=True))
