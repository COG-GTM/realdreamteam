#!/usr/bin/env python3
"""Generate docs/realdreamteam-overview.pptx with python-pptx.

Follows the layout of the "In Otter News" example deck (title slide, then kicker / headline /
card slides with a mono footer), rebuilt as native, editable shapes.

Usage:  pip install python-pptx pillow && python3 docs/generate_overview_deck.py

Images: reuses docs/mockup-summary.png and docs/architecture.png. Re-render them with
  npx playwright screenshot --full-page --viewport-size=1200,800 docs/mockup-summary.html docs/mockup-summary.png
  npx -p @mermaid-js/mermaid-cli mmdc -i docs/architecture.mmd -o docs/architecture.png -b white -w 1400
"""
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

DOCS = Path(__file__).resolve().parent
OUT = DOCS / "realdreamteam-overview.pptx"
MOCKUP = DOCS / "mockup-summary.png"
ARCH = DOCS / "architecture.png"

# Palette lifted from the example deck
INK = RGBColor(0x11, 0x18, 0x27)
MUTED = RGBColor(0x5B, 0x67, 0x7D)
KICKER = RGBColor(0x4F, 0x5F, 0x8F)
CARD_FILL = RGBColor(0xFA, 0xFB, 0xFC)
CARD_LINE = RGBColor(0xE3, 0xE7, 0xEE)
PILL_FILL = RGBColor(0xE8, 0xEE, 0xF8)
PILL_INK = RGBColor(0x2F, 0x45, 0x7A)
ACCENT = RGBColor(0x1E, 0x3A, 0x8A)
ROW_LINE = RGBColor(0xEE, 0xF0, 0xF4)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

SANS = "Arial"
MONO = "Courier New"

W, H = Inches(10), Inches(5.625)  # matches the example deck (9144000 x 5143500 EMU)
M = Inches(0.5)
TOTAL = 6


def add_text(slide, left, top, width, height, paragraphs, size=11, color=INK, bold=False,
             font=SANS, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, margin=0.0):
    """paragraphs: list of str | (str, opts) | list-of-runs where a run is str | (str, opts)."""
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Inches(margin)
    for i, item in enumerate(paragraphs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        runs = item if isinstance(item, list) else [item]
        popts = {}
        for run in runs:
            text, opts = (run, {}) if isinstance(run, str) else run
            popts = {**popts, **opts}
            if opts.get("bullet"):
                text = "\u2022  " + text
            r = p.add_run()
            r.text = text
            r.font.name = opts.get("font", font)
            r.font.size = Pt(opts.get("size", size))
            r.font.bold = opts.get("bold", bold)
            r.font.italic = opts.get("italic", False)
            r.font.color.rgb = opts.get("color", color)
        p.space_after = Pt(popts.get("space_after", 4))
    return box


def _flat(shp):
    shp.shadow.inherit = False
    style = shp._element.find(qn("p:style"))
    if style is not None:
        shp._element.remove(style)


def card(slide, left, top, width, height):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shp.adjustments[0] = 0.04
    shp.fill.solid()
    shp.fill.fore_color.rgb = CARD_FILL
    shp.line.color.rgb = CARD_LINE
    shp.line.width = Pt(0.75)
    _flat(shp)
    return shp


def pill(slide, left, top, text, width=None):
    width = width or Inches(0.12 + 0.075 * len(text))
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, Inches(0.22))
    shp.adjustments[0] = 0.5
    shp.fill.solid()
    shp.fill.fore_color.rgb = PILL_FILL
    shp.line.fill.background()
    _flat(shp)
    tf = shp.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    r.font.name = SANS
    r.font.size = Pt(8)
    r.font.bold = True
    r.font.color.rgb = PILL_INK
    return left + width + Inches(0.08)


def header(slide, kicker, headline, sub=None):
    add_text(slide, M, Inches(0.32), W - 2 * M, Inches(0.25), [kicker.upper()],
             size=8, color=KICKER, font=MONO)
    add_text(slide, M, Inches(0.55), W - 2 * M, Inches(0.45), [headline],
             size=22, bold=True)
    if sub:
        add_text(slide, M, Inches(1.0), W - 2 * M, Inches(0.5), [sub], size=11, color=MUTED)


def footer(slide, label, n):
    y = H - Inches(0.42)
    add_text(slide, M, y, Inches(6), Inches(0.2), [label], size=7.5, color=MUTED, font=MONO)
    add_text(slide, W - M - Inches(1.5), y, Inches(1.5), Inches(0.2), [f"{n} / {TOTAL}"],
             size=7.5, color=MUTED, font=MONO, align=PP_ALIGN.RIGHT)


def card_text(slide, left, top, width, height, title, body, size=9.5):
    card(slide, left, top, width, height)
    pad = Inches(0.15)
    add_text(slide, left + pad, top + pad, width - 2 * pad, height - 2 * pad,
             [(title, {"size": 11, "bold": True, "space_after": 5}), *body], size=size)


def bullets(items, size=9.5, space_after=4, color=INK):
    return [(t, {"bullet": True, "size": size, "space_after": space_after, "color": color}) for t in items]


def picture_fit(slide, path, left, top, max_w, max_h, border=True):
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(max_w / iw, max_h / ih)
    w, h = int(iw * scale), int(ih * scale)
    pic = slide.shapes.add_picture(str(path), left + (max_w - w) // 2, top, Emu(w), Emu(h))
    if border:
        pic.line.color.rgb = CARD_LINE
        pic.line.width = Pt(0.75)
    return pic


# ----------------------------------------------------------------------------- slides

def slide_title(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    add_text(s, M, Inches(1.35), W - 2 * M, Inches(0.9), ["Real Dream Team"],
             size=44, bold=True, align=PP_ALIGN.CENTER)
    add_text(s, Inches(1.5), Inches(2.3), W - Inches(3), Inches(0.7),
             [["The team's internal auction app \u2014 enter the site code, pick your name, and every lot ",
               ("you", {"italic": True, "size": 15, "color": MUTED}), " care about finds you."]],
             size=15, color=MUTED, align=PP_ALIGN.CENTER)
    rule = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, W / 2 - Inches(0.35), Inches(3.15), Inches(0.7), Pt(2.5))
    rule.fill.solid()
    rule.fill.fore_color.rgb = ACCENT
    rule.line.fill.background()
    _flat(rule)
    add_text(s, M, Inches(3.4), W - 2 * M, Inches(0.3),
             [[("Real Dream Team \u00b7 Auction app", {"bold": True}), " \u2014 Mark Porter + Devin"]],
             size=11, align=PP_ALIGN.CENTER)
    add_text(s, M, Inches(3.7), W - 2 * M, Inches(0.3),
             ["github.com/COG-GTM/realdreamteam \u00b7 rdt-auction.marklovestech.com \u00b7 20 PRs \u00b7 Sep 14\u201315, 2026"],
             size=8.5, color=MUTED, font=MONO, align=PP_ALIGN.CENTER)
    footer(s, "Internal \u00b7 Cognition GTM", 1)


def slide_plan(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "The original plan",
           "A live auction app for the team, built in under 12 hours",
           "One always-on URL the whole team can open at once \u2014 bid against each other, get matched "
           "to lots they care about, and watch an auction close live during the demo.")
    top, h = Inches(1.6), Inches(2.85)
    gap = Inches(0.15)
    w = (W - 2 * M - 2 * gap) / 3
    card_text(s, M, top, w, h, "Who it is for", [
        ("The Real Dream Team \u2014 28 team members signing in from their own browsers with one shared "
         "site code and a name picker. Admins hold a second code.", {}),
        ("Nothing runs on a laptop: one Node process on EC2 plus a shared Supabase Postgres, both up 24/7.",
         {"space_after": 0}),
    ])
    card_text(s, M + w + gap, top, w, h, "Must-have scope (the 8 demo beats)", bullets([
        "Access code \u2192 user picker \u2192 summary with Matches + Discover",
        "Preferences change \u2192 matches change",
        "Browse auctions and lot detail with bid history",
        "Two users bid on one lot; low bids rejected",
        "Admin adds a lot \u2192 matching users get notified",
        "Outbid notification; History of bids and favorites",
        "Auction closes \u2192 SOLD, hammer price, sound",
    ], size=8.5, space_after=3))
    card_text(s, M + 2 * (w + gap), top, w, h, "Definition of done", [
        *bullets([
            "Node 20 \u00b7 Express \u00b7 EJS \u00b7 pg, ~6 dependencies, no build step",
            "Data model frozen in db/schema.sql (#34)",
            "Each step = one reviewed PR with screenshots",
            "Deployed behind a public URL under systemd",
        ], size=9),
        ("Left out on purpose: search, pagination, lot editing, realtime push.",
         {"size": 9, "color": MUTED, "space_after": 0}),
    ])
    add_text(s, M, top + h + Inches(0.1), W - 2 * M, Inches(0.5),
             ["Shipped the plan and then some: 250 seeded lots across 8 auctions, a 5 s poller that closes "
              "auctions on time, Caddy TLS in front, and session cookies that re-ask for the code."],
             size=10.5, color=MUTED)
    footer(s, "Plan", 2)


def slide_product(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "The product \u00b7 live at rdt-auction.marklovestech.com", "The auction app, today")
    top = Inches(1.15)
    col_w = Inches(4.1)
    add_text(s, M, top, col_w, Inches(3.3), [
        [("Sign in", {"bold": True}), " with the site code, then pick your name."],
        [("Summary", {"bold": True}), " shows Notifications, \u201cMatches your interests\u201d, and Discover "
         "\u2014 5 random open lots, fresh on every refresh."],
        [("Browse", {"bold": True}), " auctions and lots, \u2605 favorite, and place whole-number bids that "
         "must beat the current high bid."],
        [("Matching", {"bold": True}), " by category, artist or keyword, with \u201cwhy it matched\u201d chips "
         "on every card."],
        [("Auction close", {"bold": True}), " \u2192 SOLD ribbon, hammer price, winner, a sound, and Won/Lost "
         "notifications for every bidder."],
        [("/admin", {"bold": True}), " (second code): add lots, edit close times, close/reopen auctions, "
         "ban users."],
    ], size=10.5)
    add_text(s, M, Inches(3.95), col_w, Inches(0.5),
             ["Lot images are hotlinked from Wikimedia Commons; all state lives in Postgres."],
             size=9.5, color=MUTED)
    btn = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, M, Inches(4.4), Inches(1.7), Inches(0.36))
    btn.adjustments[0] = 0.3
    btn.fill.solid()
    btn.fill.fore_color.rgb = ACCENT
    btn.line.fill.background()
    _flat(btn)
    tf = btn.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = "Open the app \u2192"
    r.font.name, r.font.size, r.font.bold, r.font.color.rgb = SANS, Pt(10), True, WHITE
    add_text(s, M + Inches(1.85), Inches(4.47), Inches(2.3), Inches(0.25),
             ["npm start"], size=8, color=MUTED, font=MONO)
    img_left = M + col_w + Inches(0.3)
    img_w = W - M - img_left
    picture_fit(s, MOCKUP, img_left, top, img_w, Inches(3.65))
    add_text(s, img_left, Inches(4.85), img_w, Inches(0.2), ["docs/mockup-summary.html"],
             size=7.5, color=MUTED, font=MONO, align=PP_ALIGN.RIGHT)
    footer(s, "Demo \u00b7 github.com/COG-GTM/realdreamteam", 3)


def slide_architecture(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "How it runs \u00b7 three moving parts, all always on", "Architecture")
    top = Inches(1.1)
    picture_fit(s, ARCH, M, top, W - 2 * M, Inches(1.85))
    add_text(s, M, top + Inches(1.87), W - 2 * M, Inches(0.2),
             ["docs/architecture.mmd \u00b7 rendered with mermaid-cli"], size=7.5, color=MUTED, font=MONO)
    ctop, ch = Inches(3.25), Inches(1.75)
    gap = Inches(0.15)
    w = (W - 2 * M - gap) / 2
    card_text(s, M, ctop, w, ch, "Stack", bullets([
        "Node.js 20 + Express + EJS + hand-written SQL (pg)",
        "No build step, no frontend framework, no API layer \u2014 the server renders HTML",
        "Stateless Node process under systemd, with a 5 s poller that closes auctions on time",
        "State only in Postgres; npm run db:reset reloads data/seed/*.json",
    ], size=9))
    card_text(s, M + w + gap, ctop, w, ch, "Request flow", bullets([
        "IONOS DNS \u2192 EC2 instance",
        "Caddy terminates TLS on 80/443 (Let\u2019s Encrypt) \u2192 Node on :3000",
        "Node runs a few SQL queries against Supabase Postgres \u2192 plain HTML",
        "Browser fetches lot images straight from Wikimedia Commons",
    ], size=9))
    footer(s, "Architecture", 4)


SESSIONS = [
    ("Design", "v1 design, build design, mockups; decided the 8 demo beats and the stack.",
     ["#3", "#17", "#20", "#36"]),
    ("Data Model", "Frozen Postgres schema (9 tables), schema-review changes, auction-house survey.",
     ["#22", "#34", "#39"]),
    ("Backend database work \u00b7 RDT Synthetic Data",
     "Supabase setup; 4 houses, 28 users, 8 auctions, 250 lots with images, bids, favorites.",
     ["#18", "#47", "#41"]),
    ("Permissions & access \u00b7 RDT-Quality \u00b7 RDT-Security \u00b7 Links & References",
     "Access codes and session cookies, review passes, secrets moved to a private note, session index.",
     ["#51", "#52", "#53", "#59"]),
]

TIMELINE = [
    ("Sep 14, 15:59\u201318:43", "#1\u2013#3, #17, #18", "Static site, v1 design proposal, review fixes, mock seed data"),
    ("Sep 14, 21:18\u201323:25", "#22, #20, #34, #39, #36", "v2 schema, summary mockup, Postgres data model, build design"),
    ("Sep 15, 00:20\u201300:33", "#47, #51, #41", "Full seed data, session index, the app itself (scaffold, summary, bidding, admin, poller)"),
    ("Sep 15, 00:37\u201301:00", "#52, #53, #55, #56, #57", "Secrets out of the repo, Caddy TLS, README + architecture, static site removed"),
    ("Sep 15, 01:19\u201308:57", "#59, #63", "Session cookies + Sign out; \u201cPortrait of Devin\u201d lot"),
]


def slide_build(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "How we delegated \u00b7 one Devin session per concern",
           "One builder, eight Devin sessions, twenty PRs")
    top, h = Inches(1.1), Inches(1.45)
    gap = Inches(0.12)
    w = (W - 2 * M - 3 * gap) / 4
    for i, (title, body, prs_) in enumerate(SESSIONS):
        left = M + i * (w + gap)
        card(s, left, top, w, h)
        pad = Inches(0.12)
        add_text(s, left + pad, top + pad, w - 2 * pad, h - 2 * pad,
                 [(title, {"size": 9.5, "bold": True, "space_after": 4}), (body, {"size": 8.5})])
        x = left + pad
        for label in prs_:
            x = pill(s, x, top + h - pad - Inches(0.22), label)
    ttop = top + h + Inches(0.15)
    th = H - ttop - Inches(0.55)
    card(s, M, ttop, W - 2 * M, th)
    pad = Inches(0.15)
    add_text(s, M + pad, ttop + pad, W - 2 * M - 2 * pad, Inches(0.25),
             [[("Execution \u2014 every change landed as a reviewed PR into ", {"bold": True, "size": 10.5}),
               ("main", {"bold": True, "size": 10, "font": MONO, "color": PILL_INK})]])
    add_text(s, M + pad, ttop + Inches(0.45), W - 2 * M - 2 * pad, Inches(0.25),
             ["devin/* branches \u00b7 feature:/bug: commits + screenshots \u00b7 opened by "
              "devin-ai-integration[bot] \u00b7 reviewed & merged by CognitionMark"],
             size=8, color=MUTED, font=MONO)
    cols = [Inches(1.55), Inches(1.75), W - 2 * M - 2 * pad - Inches(3.3)]
    x0 = M + pad
    y = ttop + Inches(0.72)
    for j, (label, xw) in enumerate(zip(["WHEN", "PRS", "WHAT CHANGED"], cols)):
        add_text(s, x0 + sum(cols[:j], Emu(0)), y, xw, Inches(0.2), [label], size=7, color=MUTED, font=MONO)
    y += Inches(0.2)
    row_h = Inches(0.27)
    for when, prs_, what in TIMELINE:
        line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x0, y, W - 2 * M - 2 * pad, Pt(0.75))
        line.fill.solid()
        line.fill.fore_color.rgb = ROW_LINE
        line.line.fill.background()
        _flat(line)
        for j, (txt, xw) in enumerate(zip([when, prs_, what], cols)):
            add_text(s, x0 + sum(cols[:j], Emu(0)), y + Inches(0.04), xw, row_h, [txt],
                     size=8.5, color=INK if j == 2 else MUTED)
        y += row_h
    footer(s, "Delegation & execution \u00b7 20 of 20 PRs merged", 5)


def slide_next(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    header(s, "Next steps \u00b7 path forward", "From a demo-night build to something the team keeps")
    top, h = Inches(1.1), Inches(2.3)
    gap = Inches(0.15)
    w = (W - 2 * M - gap) / 2
    card_text(s, M, top, w, h, "1 \u00b7 Own the images", [
        ("Lot images are hotlinked from Wikimedia/Wikipedia today. Upload them to the Supabase "
         "lots bucket (needs a service-role key) before treating the deployment as public.",
         {"space_after": 10}),
        ("2 \u00b7 Real avatars and local time", {"size": 11, "bold": True, "space_after": 5}),
        ("Seed users still use gravatar fallbacks (#42) and times render in UTC rather than US Central (#45).", {}),
    ])
    card_text(s, M + w + gap, top, w, h, "3 \u00b7 Bring back the deferred v1 features", [
        ("Search and filters, pagination, lot edit/delete, and realtime updates instead of refresh "
         "were all cut on purpose for the demo window.", {"space_after": 10}),
        ("4 \u00b7 Slack notifications", {"size": 11, "bold": True, "space_after": 5}),
        ("The in-app feed is the source of truth; the Slack webhook is wired but optional. "
         "Turn it on for new-lot and outbid events once the channel is agreed.", {}),
    ])
    card_text(s, M, top + h + Inches(0.15), W - 2 * M, Inches(0.95), "What has to come with it", [
        ("Infrastructure details stay in the private \u201cRDT infrastructure access\u201d knowledge note and "
         "the org secrets (AUCTION_DATABASE_URL, AUCTION_DATABASE_PASSWORD, RDT_EC2_SSH_KEY); the repo has "
         "node --test unit tests but no CI yet \u2014 the gap today is a PR check that runs them.", {}),
    ])
    footer(s, "Path forward", 6)


def main():
    for p in (MOCKUP, ARCH):
        if not p.exists():
            raise SystemExit(f"missing {p} \u2014 see the render commands in this file's docstring")
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H
    for build in (slide_title, slide_plan, slide_product, slide_architecture, slide_build, slide_next):
        build(prs)
    prs.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
