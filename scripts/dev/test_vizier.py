import ssl
ssl._create_default_https_context = ssl._create_unverified_context
from astroquery.vizier import Vizier
v = Vizier(columns=['*'])
try:
    r = v.query_object('Proxima Centauri', catalog='I/355/gaiadr3')
    print('RESULT', r)
    if r: print(r[0].colnames)
except Exception as e:
    print('ERR', repr(e))