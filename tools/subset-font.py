# One-off script: cuts Grenze Gotisch down to the letters the game needs and saves it as woff2.
# Run it again only to change the letter set. It needs fontTools and brotli:
#   python -m pip install fonttools brotli
#   python tools/subset-font.py <GrenzeGotisch[wght].ttf> src/ui/fonts/grenze-gotisch.woff2
# The source font is the variable-weight file from Google Fonts' GitHub:
#   https://github.com/google/fonts/tree/main/ofl/grenzegotisch  (SIL Open Font License 1.1)
# Keep OFL.txt next to the output.
import sys
from fontTools import subset

# Basic Latin and Latin-1, Latin Extended-A and -B (Lithuanian, Latvian, Polish, Estonian,
# German and more), combining accents, Latin Extended Additional, and common punctuation.
UNICODES = (
    "U+0020-007E,U+00A0-024F,U+0259,U+02C6-02DD,U+0300-036F,U+1E00-1EFF,"
    "U+2000-206F,U+20AC,U+2122,U+2190-2195,U+2212"
)


def main(src, dst):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]  # keep ligatures and kerning
    options.name_IDs = ["*"]  # keep the copyright and licence names, as the OFL asks
    options.name_languages = ["*"]
    options.notdef_outline = True
    font = subset.load_font(src, options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    subset.save_font(font, dst, options)
    print("wrote", dst)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python tools/subset-font.py <source.ttf> <output.woff2>")
    main(sys.argv[1], sys.argv[2])
