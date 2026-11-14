import ssl
ssl._create_default_https_context = ssl._create_unverified_context
from astroquery.simbad import Simbad
try:
    t = Simbad.query_object('Proxima Centauri')
    print('COLS', t.colnames if t is not None else None)
    if t is not None: print(t)
except Exception as e:
    print('ERR', repr(e))