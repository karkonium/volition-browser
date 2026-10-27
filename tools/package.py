"""Make an installable source archive without test files or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
with ZipFile(root / 'finite-scroll-extension.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted((root / 'extension').rglob('*')):
        if file.is_file() and not file.name.startswith('.'):
            archive.write(file, Path('finite-scroll-extension') / file.relative_to(root / 'extension'))
    archive.write(root / 'README.md', 'INSTALL.md')
print(root / 'finite-scroll-extension.zip')
