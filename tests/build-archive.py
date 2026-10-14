"""Build private deployment archives with portable permissions. config.php stays out of Git."""
from pathlib import Path
import zipfile, stat
root=Path(__file__).resolve().parent.parent
files=['index.html','quiz.html','analytics.html','styles.css','analytics.css','player.js','preloader.js','track.js','quiz.js','analytics.js','api.php','config.php','config.example.php','.htaccess','README.md']
files += [str(p.relative_to(root)) for p in (root/'php').iterdir() if p.is_file()]
files += ['assets/favicon.svg','assets/preview.avif','assets/liberty-club.png']
for full,name in [(False,'libertyclub-php.zip'),(True,'libertyclub-php-full.zip')]:
    with zipfile.ZipFile(root/name,'w',zipfile.ZIP_STORED if full else zipfile.ZIP_DEFLATED,allowZip64=True) as z:
        paths=files+(['assets/VSL_oct.mp4'] if full else [])
        for directory in ['assets/','php/']:
            info=zipfile.ZipInfo(directory);info.create_system=3;info.external_attr=(stat.S_IFDIR|0o755)<<16;z.writestr(info,b'')
        for path in paths:
            info=zipfile.ZipInfo.from_file(root/path,path);info.create_system=3;info.external_attr=(stat.S_IFREG|0o644)<<16
            info.compress_type=zipfile.ZIP_STORED if full else zipfile.ZIP_DEFLATED
            with z.open(info,'w',force_zip64=True) as target, (root/path).open('rb') as source:
                while chunk:=source.read(1024*1024):target.write(chunk)
    print(name,(root/name).stat().st_size)
