import pathlib
d = pathlib.Path(__file__).resolve().parent
font = (d.parent/'font'/'gg.b64').read_text().strip()
css = (d/'style.css').read_text().replace('{{FONT}}', font)
realm = (d/'realm1.js').read_text() + (d/'realm2.js').read_text()
ui = (d/'ui.js').read_text()
for js in (realm, ui):
    assert '</script' not in js.lower()
html = (d/'shell.html').read_text().replace('{{CSS}}', css).replace('{{REALM}}', realm).replace('{{UI}}', ui)
out = (d/'kin-and-crown.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html)
(d/'realm.js').write_text(realm)
print('built', len(html)//1024, 'KB')
