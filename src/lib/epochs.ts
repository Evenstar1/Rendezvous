/**
 * Reference epochs for the catalogues bundled with the packs.
 *
 * Gaia DR3 positions are reported at J2016.0. CatWISE2020 positions are
 * reported at MJD 57170 = 2015.40 (IRSA CatWISE2020 README), not at the
 * AllWISE epoch used by older WISE catalogues. Matching or propagating a
 * CatWISE source with 2010.6 introduces a five-year error that is larger
 * than a SPHEREx pixel for high-proper-motion stars.
 */
export const GAIA_EPOCH = 2016.0;
export const CATWISE_EPOCH = 2015.4;
/** AllWISE positions, used only by the all-sky W1/W2 HiPS mosaics. */
export const ALLWISE_EPOCH = 2010.6;
