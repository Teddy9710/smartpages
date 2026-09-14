"""Package the built extension without repository files or release drafts."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
build = root / "dist"
manifest = json.loads((build / "manifest.json").read_text(encoding="utf-8"))
output = root / f"smartpages-v{manifest['version']}.zip"
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for file in sorted(build.rglob("*")):
        if file.is_file():
            archive.write(file, file.relative_to(build).as_posix())
print(output)
