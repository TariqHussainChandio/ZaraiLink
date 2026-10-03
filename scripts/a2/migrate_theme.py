"""A2: move frontend code from the old theme API to the design system's (D14).

Applies the renames that have one right answer and reports every other use of the old API for a hand edit:

    python scripts/a2/migrate_theme.py            # rewrite files in place and print the report
    python scripts/a2/migrate_theme.py --check    # only report what is left (exit 1 if anything is)

Kept after A2 because branches built on the old theme (the parked A3 work) need the same migration when ported.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = ("frontend/theme/", "frontend/services/api/generated/")

# ---- renames with one right answer ------------------------------------------------------------------------------
SPACE = {"xs": 1, "sm": 2, "md": 3, "lg": 4, "xl": 6, "'2xl'": 8, "'3xl'": 12}
RADIUS = {"sm": "xs", "md": "sm", "lg": "md", "xl": "lg", "full": "pill"}
COLOURS = {
    r"colors\.text\.primary\b": "colors.ink",
    r"colors\.text\.secondary\b": "colors.ink2",
    r"colors\.background\.surface\b": "colors.surface",
    r"colors\.background\.default\b": "colors.ground",
    r"colors\.border\b": "colors.line",
    r"colors\.semantic\.error\b": "colors.status.danger.mark",
    r"colors\.semantic\.warning\b": "colors.status.warning.mark",
    r"colors\.semantic\.success\b": "colors.status.success.mark",
    r"colors\.semantic\.info\b": "colors.status.info.mark",
    r"colors\.brand\.primaryTint\b": "colors.accent.brand.soft",
}
MODULES = {
    "orders": "module.orders", "marketplace": "module.marketplace", "payments": "module.payments",
    "consultation": "module.expert", "expert": "module.expert", "dealer": "module.dealer", "inventory": "module.dealer",
    "diseaseAdvisory": "module.ai", "notifications": "module.notifications",
    "admin": "accent.admin.mark", "farmer": "accent.farmer.mark", "buyer": "accent.buyer.mark",
}

# ---- type sizes to named styles -----------------------------------------------------------------------------------
STYLE_WEIGHT = {"caption": 500, "overline": 700, "body": 400, "bodyStrong": 600, "bodyLg": 400, "title": 700,
                "titleLg": 700, "headline": 700, "display": 700}
WEIGHTS = {"regular": 400, "medium": 500, "semibold": 600, "bold": 700}
WEIGHT_NAME = {v: k for k, v in WEIGHTS.items()}
SIZE_RE = re.compile(r"typography\.sizes(?:\.(\w+)|\[('\w+')\])")
WEIGHT_RE = re.compile(r"typography\.weights\.(\w+)")


def style_for(size: str, weight: int | None, upper: bool) -> str:
    size = size.strip("'")
    if size == "xs":
        return "overline" if upper else "caption"
    if size == "sm":
        return "caption"
    if size == "base":
        return "bodyStrong" if (weight or 400) >= 600 else "body"
    if size == "lg":
        return "title" if (weight or 400) >= 600 else "bodyLg"
    if size == "xl":
        return "titleLg"
    if size == "2xl":
        return "headline"
    return "display"


def migrate_type_blocks(text: str) -> str:
    """Replace `fontSize: typography.sizes.x` (+ weight, + line height) inside one style object with a named style."""

    def block(m: re.Match[str]) -> str:
        body = m.group(0)
        size_line = re.search(r"(?m)^([ \t]*)fontSize:\s*" + SIZE_RE.pattern + r"\s*,?[ \t]*\n", body)
        if not size_line:
            return body
        indent, size = size_line.group(1), size_line.group(2) or size_line.group(3)
        weight_line = re.search(r"(?m)^[ \t]*fontWeight:\s*" + WEIGHT_RE.pattern + r"[^,\n]*,?[ \t]*\n", body)
        weight = WEIGHTS.get(weight_line.group(1)) if weight_line else None
        upper = "textTransform: 'uppercase'" in body
        name = style_for(size, weight, upper)
        new = f"{indent}...typography.{name},\n"
        if weight and weight > STYLE_WEIGHT[name]:
            new += f"{indent}fontWeight: fontWeight.{WEIGHT_NAME[weight]},\n"
        body = body[: size_line.start()] + new + body[size_line.end():]
        if weight_line:
            body = re.sub(r"(?m)^[ \t]*fontWeight:\s*" + WEIGHT_RE.pattern + r"[^,\n]*,?[ \t]*\n", "", body, count=1)
        body = re.sub(r"(?m)^[ \t]*lineHeight:\s*typography\.lineHeights\.\w+\s*,?[ \t]*\n", "", body)
        return body

    return re.sub(r"\{[^{}]*\}", block, text)


def migrate(text: str) -> str:
    for key, step in SPACE.items():
        text = re.sub(r"\bspacing\." + key + r"\b" if not key.startswith("'") else r"\bspacing\[" + re.escape(key) + r"\]", f"space[{step}]", text)
    for old, new in RADIUS.items():
        text = re.sub(r"\bradii\." + old + r"\b", f"radius.{new}", text)
    for pattern, new in COLOURS.items():
        text = re.sub(pattern, new, text)
    # brand.primary: a fill behind text, a mark on an icon or border, or text itself.
    lines = []
    for line in text.split("\n"):
        if re.search(r"colors\.brand\.primary\b", line):
            if "backgroundColor" in line:
                line = re.sub(r"colors\.brand\.primary\b", "colors.accent.brand.fill", line)
            elif re.search(r"borderColor|tabBarActiveTintColor|color=\{", line):
                line = re.sub(r"colors\.brand\.primary\b", "colors.accent.brand.mark", line)
            elif re.search(r"\bcolor:", line):
                line = re.sub(r"colors\.brand\.primary\b", "colors.accent.brand.ink", line)
        if re.search(r"colors\.neutral\.white\b", line):
            if "backgroundColor" in line:
                line = re.sub(r"colors\.neutral\.white\b", "colors.surface", line)
            elif re.search(r"\bcolor:|color=\{", line):
                line = re.sub(r"colors\.neutral\.white\b", "colors.onAccent", line)
        lines.append(line)
    text = "\n".join(lines)
    text = re.sub(r"theme\.roleColors\[([^\]]+)\]", r"theme.colors.accent[\1].mark", text)
    text = re.sub(r"theme\.roleColors\.(\w+)", r"theme.colors.accent.\1.mark", text)
    text = re.sub(r"theme\.moduleAccents\.(\w+)", lambda m: f"theme.colors.{MODULES[m.group(1)]}" if m.group(1) in MODULES else m.group(0), text)
    text = migrate_type_blocks(text)
    # A weight on its own (no size beside it) keeps its weight, from the theme's weight map.
    text = WEIGHT_RE.sub(r"fontWeight.\1", text)
    # A floating action button floats over content: elevation 2 in the design system.
    text = re.sub(r"\bshadows\.md\b", "shadows.elev2", text)
    # makeStyles({ colors, spacing, radii, typography }: Theme): the destructured names follow the renames.
    def params(m: re.Match[str]) -> str:
        names = [n.strip() for n in m.group(1).split(",") if n.strip()]
        names = ["space" if n == "spacing" else "radius" if n == "radii" else n for n in names]
        if "fontWeight." in text and "fontWeight" not in names:
            names.append("fontWeight")
        return "({ " + ", ".join(names) + " }: Theme)"
    text = re.sub(r"\(\{([^{}]*)\}:\s*Theme\)", params, text)
    return text


# Anything still on the old API after the renames: each needs a person to choose the right token.
LEFT = re.compile(
    r"colors\.(brand|neutral|semantic|text|background)\b|\bcolors\.border\b|typography\.(sizes|weights|lineHeights)\b|"
    r"\bshadows\.(sm|md)\b|\bspacing\.\w|\bradii\.\w|moduleAccents|roleColors|statusColors|StatusColorKey|ModuleAccentKey"
)


def files() -> list[Path]:
    out = [ROOT / "App.tsx"]
    for p in sorted((ROOT / "frontend").rglob("*")):
        rel = p.relative_to(ROOT).as_posix()
        if p.suffix in (".ts", ".tsx") and not any(rel.startswith(s) for s in SKIP):
            out.append(p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="report only; exit 1 if anything is left")
    args = ap.parse_args()
    changed, left = 0, []
    for p in files():
        text = p.read_text(encoding="utf-8")
        new = text if args.check else migrate(text)
        if new != text:
            p.write_text(new, encoding="utf-8", newline="\n")
            changed += 1
        for no, line in enumerate(new.split("\n"), 1):
            if LEFT.search(line):
                left.append(f"{p.relative_to(ROOT).as_posix()}:{no}: {line.strip()[:110]}")
    if not args.check:
        print(f"rewrote {changed} files")
    print(f"{len(left)} lines still use the old theme API" + (":" if left else ""))
    for line in left:
        print("  " + line)
    return 1 if (args.check and left) else 0


if __name__ == "__main__":
    sys.exit(main())
